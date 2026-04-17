// useVoiceRecorder — starts/stops MediaRecorder, exposes live level (0..1).
// Produces a Blob (webm/opus by default) when stopped.
import { useCallback, useEffect, useRef, useState } from 'react'

type State = 'idle' | 'requesting' | 'recording' | 'stopped' | 'error'

interface UseVoiceRecorderResult {
  state: State
  level: number                // live input level 0..1
  elapsedMs: number
  error: string | null
  start: () => Promise<void>
  stop: () => Promise<Blob | null>
  reset: () => void
}

export function useVoiceRecorder(): UseVoiceRecorderResult {
  const [state, setState] = useState<State>('idle')
  const [level, setLevel] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const startTsRef = useRef<number>(0)
  const doneRef = useRef<((b: Blob | null) => void) | null>(null)

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    if (mediaRef.current) {
      mediaRef.current.getTracks().forEach(t => t.stop())
      mediaRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    analyserRef.current = null
    recorderRef.current = null
  }, [])

  const reset = useCallback(() => {
    cleanup()
    chunksRef.current = []
    setState('idle')
    setLevel(0)
    setElapsedMs(0)
    setError(null)
  }, [cleanup])

  const start = useCallback(async () => {
    if (state === 'recording') return
    try {
      setState('requesting')
      setError(null)
      chunksRef.current = []

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1,
        },
      })
      mediaRef.current = stream

      // Level meter
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      src.connect(analyser)
      analyserRef.current = analyser

      const buf = new Uint8Array(analyser.fftSize)
      const loop = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / buf.length)
        setLevel(Math.min(rms * 2, 1))
        setElapsedMs(Date.now() - startTsRef.current)
        rafRef.current = requestAnimationFrame(loop)
      }

      // Recorder
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const rec = new MediaRecorder(stream, { mimeType: mime })
      rec.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime })
        cleanup()
        setState('stopped')
        doneRef.current?.(blob)
        doneRef.current = null
      }
      rec.onerror = ev => {
        setError(String((ev as any).error ?? 'MediaRecorder error'))
        cleanup()
        setState('error')
      }

      recorderRef.current = rec
      rec.start(100)
      startTsRef.current = Date.now()
      setState('recording')
      loop()
    } catch (e: any) {
      setError(e?.message ?? String(e))
      setState('error')
      cleanup()
    }
  }, [cleanup, state])

  const stop = useCallback(async (): Promise<Blob | null> => {
    const rec = recorderRef.current
    if (!rec || rec.state === 'inactive') return null
    return new Promise(resolve => {
      doneRef.current = resolve
      rec.stop()
    })
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  return { state, level, elapsedMs, error, start, stop, reset }
}
