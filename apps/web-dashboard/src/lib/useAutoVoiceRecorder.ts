// useAutoVoiceRecorder — VAD-driven continuous capture.
//
// Once you call start(), it listens to the mic forever. Whenever it hears
// speech, it opens a MediaRecorder; when it hears 500ms of trailing silence,
// it closes the recorder and calls onSegment with a Blob. Then it goes back
// to listening for the next utterance. Hands-free.
//
// The segmentation is energy-based (RMS with hysteresis), not an ML VAD.
// That is deliberate — for enrollment in a quiet room reading prompts this
// is accurate, tiny, and has no extra dependencies.
import { useCallback, useEffect, useRef, useState } from 'react'

export type AutoState = 'idle' | 'listening' | 'recording' | 'paused' | 'error'

export interface AutoSegmentMeta {
  durationMs: number
  maxLevel: number
}

export interface UseAutoVoiceRecorderOptions {
  onSegment: (blob: Blob, meta: AutoSegmentMeta) => void
  /** RMS level below which audio is considered silence (0..1). Default 0.012. */
  silenceRms?: number
  /** RMS level above which audio counts as speech onset (0..1). Default 0.035. */
  speechRms?: number
  /** Consecutive frames above speechRms to start recording. Default 3. */
  speechStartFrames?: number
  /** Milliseconds of silence to end an utterance. Default 600. */
  silenceEndMs?: number
  /** Minimum utterance duration to emit. Default 800ms. */
  minUtteranceMs?: number
  /** Maximum utterance duration before auto-cut. Default 15_000ms. */
  maxUtteranceMs?: number
}

export interface UseAutoVoiceRecorderResult {
  state: AutoState
  level: number // 0..1 — live input level
  error: string | null
  start: () => Promise<void>
  pause: () => void
  resume: () => void
  stop: () => void
}

export function useAutoVoiceRecorder(
  opts: UseAutoVoiceRecorderOptions,
): UseAutoVoiceRecorderResult {
  const {
    onSegment,
    silenceRms = 0.012,
    speechRms = 0.035,
    speechStartFrames = 3,
    silenceEndMs = 600,
    minUtteranceMs = 800,
    maxUtteranceMs = 15000,
  } = opts

  const [state, setState] = useState<AutoState>('idle')
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Stream + audio graph
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)

  // Recorder
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingStartRef = useRef<number>(0)
  const recordingRef = useRef(false)
  const pausedRef = useRef(false)

  // VAD frame counters
  const speechFramesRef = useRef(0)
  const silenceStartedAtRef = useRef<number | null>(null)
  const maxLevelRef = useRef(0)

  // Keep callbacks current without re-running the loop
  const onSegmentRef = useRef(onSegment)
  useEffect(() => {
    onSegmentRef.current = onSegment
  }, [onSegment])

  const cleanupAudio = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop()
      } catch {}
    }
    recorderRef.current = null
    recordingRef.current = false
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {})
      ctxRef.current = null
    }
    analyserRef.current = null
  }, [])

  const startRecorder = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'
    const rec = new MediaRecorder(stream, { mimeType: mime })
    chunksRef.current = []
    maxLevelRef.current = 0
    rec.ondataavailable = e => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
    }
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime })
      const durationMs = Date.now() - recordingStartRef.current
      const maxLevel = maxLevelRef.current
      chunksRef.current = []
      recorderRef.current = null
      recordingRef.current = false
      silenceStartedAtRef.current = null
      speechFramesRef.current = 0
      if (durationMs >= minUtteranceMs) {
        onSegmentRef.current(blob, { durationMs, maxLevel })
      }
      // Return to listening (unless we've been paused or stopped)
      if (streamRef.current && !pausedRef.current) {
        setState('listening')
      }
    }
    rec.onerror = ev => {
      setError(String((ev as any).error ?? 'MediaRecorder error'))
      setState('error')
      cleanupAudio()
    }
    rec.start(100)
    recorderRef.current = rec
    recordingStartRef.current = Date.now()
    recordingRef.current = true
    setState('recording')
  }, [cleanupAudio, minUtteranceMs])

  const stopRecorder = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop()
      } catch {}
    }
  }, [])

  const tickRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    const tick = () => {
      const analyser = analyserRef.current
      if (!analyser) return

      const buf = new Uint8Array(analyser.fftSize)
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / buf.length)
      setLevel(Math.min(rms * 2, 1))

      if (pausedRef.current) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const now = Date.now()

      if (recordingRef.current) {
        if (rms > maxLevelRef.current) maxLevelRef.current = rms

        // Silence-end detection
        if (rms < silenceRms) {
          if (silenceStartedAtRef.current == null) {
            silenceStartedAtRef.current = now
          } else if (now - silenceStartedAtRef.current >= silenceEndMs) {
            stopRecorder()
          }
        } else {
          silenceStartedAtRef.current = null
        }

        // Max-duration cut
        if (now - recordingStartRef.current > maxUtteranceMs) {
          stopRecorder()
        }
      } else {
        // Listening for speech onset
        if (rms > speechRms) {
          speechFramesRef.current++
          if (speechFramesRef.current >= speechStartFrames) {
            startRecorder()
          }
        } else {
          speechFramesRef.current = 0
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    tickRef.current = tick
  }, [silenceRms, speechRms, speechStartFrames, silenceEndMs, maxUtteranceMs, startRecorder, stopRecorder])

  const start = useCallback(async () => {
    if (state === 'listening' || state === 'recording') return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1,
        },
      })
      streamRef.current = stream

      const ctx = new AudioContext()
      ctxRef.current = ctx
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      src.connect(analyser)
      analyserRef.current = analyser

      pausedRef.current = false
      speechFramesRef.current = 0
      silenceStartedAtRef.current = null
      setState('listening')

      if (tickRef.current) rafRef.current = requestAnimationFrame(tickRef.current)
    } catch (e: any) {
      setError(e?.message ?? String(e))
      setState('error')
      cleanupAudio()
    }
  }, [state, cleanupAudio])

  const pause = useCallback(() => {
    pausedRef.current = true
    if (recordingRef.current) stopRecorder()
    if (streamRef.current) setState('paused')
  }, [stopRecorder])

  const resume = useCallback(() => {
    if (!streamRef.current) return
    pausedRef.current = false
    speechFramesRef.current = 0
    silenceStartedAtRef.current = null
    setState('listening')
  }, [])

  const stop = useCallback(() => {
    cleanupAudio()
    setState('idle')
    setLevel(0)
  }, [cleanupAudio])

  useEffect(() => () => cleanupAudio(), [cleanupAudio])

  return { state, level, error, start, pause, resume, stop }
}
