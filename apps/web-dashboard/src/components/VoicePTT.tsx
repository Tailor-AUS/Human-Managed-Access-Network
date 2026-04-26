/**
 * VoicePTT — push-to-talk voice loop, in the PWA.
 *
 * Hold the button (mouse-down or touch-start) → MediaRecorder captures
 * webm/opus → release → blob is POSTed to /api/audio/transcribe →
 * transcript POSTed to /api/voice/respond → reply audio plays back.
 *
 * Playback path:
 *   1. If the bridge returns `tts_url`, fetch it (with bearer auth)
 *      into a Blob URL and play via `<audio>`.
 *   2. Otherwise fall back to `window.speechSynthesis` so the loop is
 *      still useful on machines without Piper installed.
 *
 * Latency goal: end-of-utterance to start-of-reply audio under 3s on
 * RTX 4090 + LAN (faster-whisper "base" int8 + llama3.2:3b on Ollama).
 *
 * iOS background-audio limitation
 * ───────────────────────────────
 * On iOS Safari, MediaRecorder and getUserMedia capture stop the
 * moment the PWA goes to background or the screen locks. **This is
 * a known PWA constraint on iOS** — there is no API to keep the mic
 * open in the background from a web context. Wave 1 explicitly
 * accepts this; background audio is the job of the Wave 2 native
 * client (issue #7). Don't try to chase this in JavaScript.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Loader2 } from 'lucide-react'
import { hman } from '../lib/hman'
import { useVoiceRecorder } from '../lib/useVoiceRecorder'

type Phase = 'idle' | 'recording' | 'transcribing' | 'thinking' | 'speaking' | 'error'

interface VoicePTTProps {
  /** Optional system-prompt override forwarded to /api/voice/respond. */
  context?: string
  /** Render the button as a fixed floating action button. */
  floating?: boolean
}

export function VoicePTT({ context, floating = false }: VoicePTTProps) {
  const recorder = useVoiceRecorder()
  const [phase, setPhase] = useState<Phase>('idle')
  const [transcript, setTranscript] = useState<string>('')
  const [reply, setReply] = useState<string>('')
  const [err, setErr] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  const cleanupBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }, [])

  useEffect(() => () => {
    cleanupBlobUrl()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    // Cancel any pending TTS on unmount
    try { window.speechSynthesis?.cancel() } catch {}
  }, [cleanupBlobUrl])

  const handleStart = useCallback(async () => {
    if (phase !== 'idle' && phase !== 'error') return
    setErr(null)
    setTranscript('')
    setReply('')
    cleanupBlobUrl()
    try { window.speechSynthesis?.cancel() } catch {}
    setPhase('recording')
    try {
      await recorder.start()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
      setPhase('error')
    }
  }, [phase, recorder, cleanupBlobUrl])

  const handleStop = useCallback(async () => {
    if (phase !== 'recording') return
    let blob: Blob | null = null
    try {
      blob = await recorder.stop()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
      setPhase('error')
      return
    }
    if (!blob || blob.size < 800) {
      // <800 bytes ≈ no real audio captured (button mashed or no mic data)
      setPhase('idle')
      return
    }
    setPhase('transcribing')
    try {
      const t0 = performance.now()
      const stt = await hman.transcribe(blob)
      setTranscript(stt.text)
      if (!stt.text.trim()) {
        setPhase('idle')
        return
      }
      setPhase('thinking')
      const r = await hman.voiceRespond(stt.text, context)
      setReply(r.reply)
      const elapsed = performance.now() - t0
      // eslint-disable-next-line no-console
      console.debug(`[VoicePTT] stt+llm round-trip: ${elapsed.toFixed(0)}ms`)

      setPhase('speaking')
      if (r.tts_url) {
        try {
          const url = await hman.fetchVoiceAudio(r.tts_url)
          blobUrlRef.current = url
          const audio = new Audio(url)
          audioRef.current = audio
          audio.onended = () => {
            cleanupBlobUrl()
            setPhase('idle')
          }
          audio.onerror = () => {
            cleanupBlobUrl()
            // Fall back to Web Speech Synthesis on playback failure
            speakViaWebSpeech(r.reply, () => setPhase('idle'))
          }
          await audio.play()
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[VoicePTT] tts_url playback failed, falling back', e)
          speakViaWebSpeech(r.reply, () => setPhase('idle'))
        }
      } else {
        speakViaWebSpeech(r.reply, () => setPhase('idle'))
      }
    } catch (e: any) {
      setErr(e?.message ?? String(e))
      setPhase('error')
    }
  }, [phase, recorder, context, cleanupBlobUrl])

  // Pointer events cover mouse + touch + pen on a single handler set.
  // Capturing pointer ensures release outside the button still fires up.
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    void handleStart()
  }
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    void handleStop()
  }
  const onPointerCancel = () => {
    void handleStop()
  }

  const label = phaseLabel(phase, recorder.elapsedMs)
  const busy = phase === 'transcribing' || phase === 'thinking' || phase === 'speaking'

  return (
    <div
      className={
        floating
          ? 'fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2'
          : 'flex flex-col items-start gap-3'
      }
    >
      {(transcript || reply || err) && (
        <div
          className={`max-w-md rounded-lg border px-3 py-2 text-sm shadow-lg ${
            err
              ? 'border-red-500/40 bg-red-900/30 text-red-200'
              : 'border-border bg-background-secondary text-text-primary'
          }`}
        >
          {err && <p className="font-medium">Error: {err}</p>}
          {transcript && !err && (
            <p>
              <span className="text-text-secondary">You said:</span> {transcript}
            </p>
          )}
          {reply && !err && (
            <p className="mt-1">
              <span className="text-text-secondary">Reply:</span> {reply}
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={e => e.preventDefault()}
        disabled={busy}
        aria-label="Hold to talk"
        className={`select-none touch-none rounded-full shadow-lg flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${
          phase === 'recording'
            ? 'bg-red-600 hover:bg-red-500 text-white'
            : busy
              ? 'bg-background-secondary text-text-secondary cursor-wait'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
        }`}
        style={{
          // Subtle ring driven by live mic level while recording
          boxShadow:
            phase === 'recording'
              ? `0 0 0 ${Math.round(recorder.level * 12)}px rgba(239, 68, 68, 0.25)`
              : undefined,
        }}
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
        {label}
      </button>
    </div>
  )
}

function phaseLabel(phase: Phase, elapsedMs: number): string {
  switch (phase) {
    case 'recording':
      return `Listening… ${(elapsedMs / 1000).toFixed(1)}s`
    case 'transcribing':
      return 'Transcribing…'
    case 'thinking':
      return 'Thinking…'
    case 'speaking':
      return 'Speaking…'
    case 'error':
      return 'Hold to talk'
    case 'idle':
    default:
      return 'Hold to talk'
  }
}

function speakViaWebSpeech(text: string, onEnd: () => void): void {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
    // No TTS at all — just clear state
    onEnd()
    return
  }
  try {
    synth.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = 1.05
    utt.onend = onEnd
    utt.onerror = onEnd
    synth.speak(utt)
  } catch {
    onEnd()
  }
}
