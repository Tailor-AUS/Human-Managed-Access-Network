// .HMAN member bridge — talks to the local Python server at localhost:8765.
// Everything stays on the member's device.

const BASE =
  ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_HMAN_BRIDGE) ??
  'http://127.0.0.1:8765'

// Bearer token for remote/production bridges.
// Dev (localhost) typically has no token. Production tunnels must use one.
// Stored in localStorage so it persists across page reloads. Setter lets
// the UI prompt for it when 401 is returned.
const TOKEN_KEY = 'hman.bridge.token'
export const token = {
  get: (): string | null => {
    try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
  },
  set: (v: string | null) => {
    try {
      if (v) localStorage.setItem(TOKEN_KEY, v)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {}
  },
}

function authHeaders(): HeadersInit {
  const t = token.get()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

export interface Health {
  ok: boolean
  version: string
  gpu: boolean
  enrolled: boolean
}

export interface GateStatus {
  name: string
  passing: boolean
  detail: string
}

export interface GatesResponse {
  member_id: string
  gates: GateStatus[]
  last_activation: string | null
  rejections_last_hour: number
}

export interface EnrollmentSession {
  session_id: string
  member_id: string
  prompts: string[]
  current_index: number
  total: number
}

export interface SampleResult {
  ok: boolean
  reason: string
  index: number
  duration_s: number
  rms: number
  peak: number
  embed_ms: number
  self_similarity: number | null
  progress: number
  next_prompt: string | null
}

export interface FinalizeResult {
  saved_to: string
  samples_used: number
  self_consistency: { min: number; mean: number; max: number }
  audit_log: string
}

export interface Gate5Status {
  enrolled: boolean
  armed: boolean
  armed_at: string | null
  threshold: number
  accepts: number
  rejects: number
  last_activation: string | null
  recent_events: { ts: string; passing: boolean; score: number }[]
}

export interface Gate5Unlock {
  armed: boolean
  armed_at: string | null
  threshold: number
}

export interface TranscribeResult {
  text: string
  duration_s: number
  rms: number
}

export interface VoiceRespondResult {
  reply: string
  /** Path on the bridge serving a one-shot signed wav. Null when Piper
   * isn't available — the client falls back to Web Speech Synthesis. */
  tts_url: string | null
}

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`HTTP ${r.status}: ${body || r.statusText}`)
  }
  return (await r.json()) as T
}

export const hman = {
  async health(): Promise<Health> {
    return j(await fetch(`${BASE}/api/health`, { headers: authHeaders() }))
  },

  async gates(): Promise<GatesResponse> {
    return j(await fetch(`${BASE}/api/gates`, { headers: authHeaders() }))
  },

  async startEnrollment(passphrase: string, memberId = 'member'): Promise<EnrollmentSession> {
    return j(
      await fetch(`${BASE}/api/enrollment/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ passphrase, member_id: memberId }),
      }),
    )
  },

  async uploadSample(
    sessionId: string,
    index: number,
    audio: Blob,
  ): Promise<SampleResult> {
    const form = new FormData()
    form.append('session_id', sessionId)
    form.append('index', String(index))
    form.append('audio', audio, `sample_${index}.webm`)
    return j(
      await fetch(`${BASE}/api/enrollment/sample`, {
        method: 'POST',
        headers: authHeaders(),
        body: form,
      }),
    )
  },

  async finalize(sessionId: string): Promise<FinalizeResult> {
    const form = new FormData()
    form.append('session_id', sessionId)
    return j(
      await fetch(`${BASE}/api/enrollment/finalize`, {
        method: 'POST',
        headers: authHeaders(),
        body: form,
      }),
    )
  },

  async gate5Status(): Promise<Gate5Status> {
    return j(await fetch(`${BASE}/api/gate5/status`, { headers: authHeaders() }))
  },

  async gate5Unlock(passphrase: string): Promise<Gate5Unlock> {
    return j(
      await fetch(`${BASE}/api/gate5/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ passphrase }),
      }),
    )
  },

  async gate5Lock(): Promise<{ armed: boolean }> {
    return j(
      await fetch(`${BASE}/api/gate5/lock`, { method: 'POST', headers: authHeaders() }),
    )
  },

  // Sensors — unified API for every capture stream (audio, keystrokes, screen, eeg)
  async sensors(): Promise<SensorStatus[]> {
    return j(await fetch(`${BASE}/api/sensors`, { headers: authHeaders() }))
  },

  async sensorStart(name: string): Promise<SensorStatus> {
    return j(
      await fetch(`${BASE}/api/sensors/${name}/start`, {
        method: 'POST',
        headers: authHeaders(),
      }),
    )
  },

  async sensorStop(name: string): Promise<SensorStatus> {
    return j(
      await fetch(`${BASE}/api/sensors/${name}/stop`, {
        method: 'POST',
        headers: authHeaders(),
      }),
    )
  },

  async sensorRecent(name: string, seconds = 3600): Promise<SensorEntry[]> {
    return j(
      await fetch(`${BASE}/api/sensors/${name}/recent?seconds=${seconds}`, {
        headers: authHeaders(),
      }),
    )
  },

  async sensorsStartAll(): Promise<SensorStatus[]> {
    return j(
      await fetch(`${BASE}/api/sensors/start_all`, {
        method: 'POST',
        headers: authHeaders(),
      }),
    )
  },

  async sensorsStopAll(): Promise<SensorStatus[]> {
    return j(
      await fetch(`${BASE}/api/sensors/stop_all`, {
        method: 'POST',
        headers: authHeaders(),
      }),
    )
  },

  // In-PWA voice loop (issue #9) — push-to-talk in the dashboard
  async transcribe(audio: Blob): Promise<TranscribeResult> {
    const form = new FormData()
    form.append('audio', audio, 'utterance.webm')
    return j(
      await fetch(`${BASE}/api/audio/transcribe`, {
        method: 'POST',
        headers: authHeaders(),
        body: form,
      }),
    )
  },

  async voiceRespond(text: string, context?: string): Promise<VoiceRespondResult> {
    return j(
      await fetch(`${BASE}/api/voice/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ text, context: context ?? null }),
      }),
    )
  },

  /** Build an absolute URL for a tts_url returned by /api/voice/respond.
   * Authorization isn't sendable from a plain `<audio>` src, so we
   * fetch the bytes here, blob-URL them, and let the caller play. */
  async fetchVoiceAudio(ttsUrl: string): Promise<string> {
    const r = await fetch(`${BASE}${ttsUrl}`, { headers: authHeaders() })
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text().catch(() => '')}`)
    const blob = await r.blob()
    return URL.createObjectURL(blob)
  },
}

export interface SensorStatus {
  name: string
  available: boolean
  running: boolean
  started_at: string | null
  last_ts: string | null
  last_error: string | null
  summary: Record<string, unknown>
}

export type SensorEntry = {
  ts: string
  [key: string]: unknown
}
