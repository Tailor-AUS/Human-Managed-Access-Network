// .HMAN member bridge — talks to the local Python server at localhost:8765.
// Everything stays on the member's device.

const BASE =
  ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_HMAN_BRIDGE) ??
  'http://127.0.0.1:8765'

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

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`HTTP ${r.status}: ${body || r.statusText}`)
  }
  return (await r.json()) as T
}

export const hman = {
  async health(): Promise<Health> {
    return j(await fetch(`${BASE}/api/health`))
  },

  async gates(): Promise<GatesResponse> {
    return j(await fetch(`${BASE}/api/gates`))
  },

  async startEnrollment(passphrase: string, memberId = 'knox-hart'): Promise<EnrollmentSession> {
    return j(
      await fetch(`${BASE}/api/enrollment/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        body: form,
      }),
    )
  },

  async gate5Status(): Promise<Gate5Status> {
    return j(await fetch(`${BASE}/api/gate5/status`))
  },

  async gate5Unlock(passphrase: string): Promise<Gate5Unlock> {
    return j(
      await fetch(`${BASE}/api/gate5/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase }),
      }),
    )
  },

  async gate5Lock(): Promise<{ armed: boolean }> {
    return j(await fetch(`${BASE}/api/gate5/lock`, { method: 'POST' }))
  },
}
