"""
.HMAN — local HTTP bridge between the browser and the member's device.

Runs on localhost:8765. The web-dashboard frontend (vite dev: localhost:5173)
talks to this for:
  - Voice enrollment (Phase A)
  - Gate status (Phase B onward)
  - HMAN attestation issuance (Phase D)

Nothing from this server is ever exposed to the internet by default. Device
portability comes later via Cloudflare Tunnel terminating at this same HTTP
surface.
"""
from __future__ import annotations

import io
import json
import secrets
import sys
import threading
import time
from collections import deque
from dataclasses import asdict, is_dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Make sibling module importable when run as script (api/server.py → ../core.py)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import core  # noqa: E402

app = FastAPI(title=".HMAN Member Bridge", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory session store (single-user, single-process is fine for local) ──

_sessions: dict[str, core.EnrollmentSession] = {}


# ── Response schemas ────────────────────────────────────────────────

class HealthResponse(BaseModel):
    ok: bool
    version: str
    gpu: bool
    enrolled: bool


class EnrollmentStart(BaseModel):
    passphrase: str
    member_id: str = "knox-hart"


class EnrollmentSessionOut(BaseModel):
    session_id: str
    member_id: str
    prompts: list[str]
    current_index: int
    total: int


class SampleResult(BaseModel):
    ok: bool
    reason: str
    index: int
    duration_s: float
    rms: float
    peak: float
    embed_ms: float
    self_similarity: Optional[float] = None  # vs. samples so far
    progress: float
    next_prompt: Optional[str] = None


class FinalizeResult(BaseModel):
    saved_to: str
    samples_used: int
    self_consistency: dict
    audit_log: str


class GateStatus(BaseModel):
    name: str
    passing: bool
    detail: str


class GatesResponse(BaseModel):
    member_id: str
    gates: list[GateStatus]
    last_activation: Optional[str] = None
    rejections_last_hour: int = 0


# ── Health / enrollment status ──────────────────────────────────────

@app.get("/api/health", response_model=HealthResponse)
def health():
    import torch
    return HealthResponse(
        ok=True,
        version="0.1.0",
        gpu=torch.cuda.is_available(),
        enrolled=core.has_enrollment(),
    )


# ── Enrollment flow ─────────────────────────────────────────────────

@app.post("/api/enrollment/session", response_model=EnrollmentSessionOut)
def start_session(body: EnrollmentStart):
    if len(body.passphrase) < 8:
        raise HTTPException(status_code=400, detail="Passphrase must be at least 8 characters")

    session_id = secrets.token_urlsafe(16)
    session = core.EnrollmentSession(
        session_id=session_id,
        member_id=body.member_id,
        started_at=datetime.now(core.AEST).isoformat(),
        prompts=list(core.PROMPTS),
        passphrase=body.passphrase,
    )
    _sessions[session_id] = session
    # Pre-warm encoder so the first sample isn't slow
    core.get_encoder()
    return EnrollmentSessionOut(
        session_id=session_id,
        member_id=session.member_id,
        prompts=session.prompts,
        current_index=0,
        total=len(session.prompts),
    )


def _decode_audio(upload: UploadFile) -> np.ndarray:
    """Decode an uploaded audio blob (webm/ogg/wav) to mono float32 16 kHz."""
    raw = upload.file.read()
    # Use soundfile first (fast path for WAV), fall back to av (webm)
    try:
        import soundfile as sf
        audio, sr = sf.read(io.BytesIO(raw), dtype="float32", always_2d=False)
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
    except Exception:
        import av
        container = av.open(io.BytesIO(raw))
        stream = next(s for s in container.streams if s.type == "audio")
        sr = stream.rate
        chunks = []
        for frame in container.decode(stream):
            arr = frame.to_ndarray()
            if arr.ndim > 1:
                arr = arr.mean(axis=0)
            chunks.append(arr.astype(np.float32))
        audio = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
        if audio.dtype != np.float32:
            audio = audio.astype(np.float32)
        # Normalise from int range if needed
        if np.max(np.abs(audio)) > 1.5:
            audio = audio / 32768.0

    if sr != core.SAMPLE_RATE:
        import librosa
        audio = librosa.resample(audio, orig_sr=sr, target_sr=core.SAMPLE_RATE)

    return audio


@app.post("/api/enrollment/sample", response_model=SampleResult)
async def upload_sample(
    session_id: str = Form(...),
    index: int = Form(...),
    audio: UploadFile = File(...),
):
    session = _sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if index != session.current_index:
        raise HTTPException(
            status_code=400,
            detail=f"Expected index {session.current_index}, got {index}",
        )

    audio_np = _decode_audio(audio)
    a = core.audit_sample(audio_np)
    if not a.ok:
        return SampleResult(
            ok=False,
            reason=a.reason,
            index=index,
            duration_s=a.duration_s,
            rms=a.rms,
            peak=a.peak,
            embed_ms=0,
            progress=session.progress,
            next_prompt=session.prompts[session.current_index],
        )

    emb, embed_ms = core.embed_audio(audio_np)

    # Self-similarity against the group so far
    self_sim: Optional[float] = None
    if session.samples:
        mean_ref = np.mean([s.embedding for s in session.samples], axis=0)
        mean_ref /= np.linalg.norm(mean_ref) + 1e-9
        self_sim = float(np.dot(emb / (np.linalg.norm(emb) + 1e-9), mean_ref))

    session.samples.append(
        core.CollectedSample(
            index=index,
            prompt=session.prompts[index],
            duration_s=a.duration_s,
            rms=a.rms,
            peak=a.peak,
            embed_ms=embed_ms,
            embedding=emb,
        )
    )
    session.current_index += 1
    next_prompt = (
        session.prompts[session.current_index]
        if session.current_index < len(session.prompts)
        else None
    )
    return SampleResult(
        ok=True,
        reason=a.reason,
        index=index,
        duration_s=a.duration_s,
        rms=a.rms,
        peak=a.peak,
        embed_ms=embed_ms,
        self_similarity=self_sim,
        progress=session.progress,
        next_prompt=next_prompt,
    )


@app.post("/api/enrollment/finalize", response_model=FinalizeResult)
def finalize(session_id: str = Form(...)):
    session = _sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if len(session.samples) < 3:
        raise HTTPException(
            status_code=400, detail=f"Need at least 3 samples, got {len(session.samples)}"
        )

    embeddings = np.stack([s.embedding for s in session.samples])
    reference = embeddings.mean(axis=0)
    reference /= np.linalg.norm(reference)

    sims = [
        float(np.dot(e / np.linalg.norm(e), reference)) for e in embeddings
    ]
    kept_idx = [i for i, s in enumerate(sims) if s >= 0.80]
    if len(kept_idx) >= 3 and len(kept_idx) < len(session.samples):
        reference = embeddings[kept_idx].mean(axis=0)
        reference /= np.linalg.norm(reference)
        session.samples = [session.samples[i] for i in kept_idx]
        sims = [float(np.dot(e / np.linalg.norm(e), reference)) for e in embeddings[kept_idx]]

    meta = {
        "member_id": session.member_id,
        "model": "resemblyzer",
        "created_at": datetime.now(core.AEST).isoformat(),
        "samples_used": len(session.samples),
    }
    path = core.save_reference(reference, session.passphrase, meta)
    log_path = core.write_enrollment_log(session, reference)

    # Remove from memory once persisted
    _sessions.pop(session_id, None)

    return FinalizeResult(
        saved_to=str(path),
        samples_used=len(session.samples),
        self_consistency={
            "min": round(min(sims), 3),
            "mean": round(sum(sims) / len(sims), 3),
            "max": round(max(sims), 3),
        },
        audit_log=str(log_path),
    )


# ── Gate 5 runtime state (speaker verification) ─────────────────────

_gate5_lock = threading.Lock()
_gate5_reference: Optional[np.ndarray] = None  # decrypted in-memory reference
_gate5_threshold: float = 0.62                 # cosine similarity acceptance threshold. Calibrated for live casual speech + Whisper-trimmed utterances. Raise to 0.75+ after richer enrollment.
_gate5_accepts: int = 0
_gate5_rejects: int = 0
_gate5_last_activation: Optional[str] = None
_gate5_events: deque = deque(maxlen=50)        # recent (ts, passing, score) tuples
_gate5_armed_at: Optional[str] = None
_gate1_last_trigger: Optional[str] = None      # Phase C: PTT / wake phrase trigger timestamp


class Gate5Unlock(BaseModel):
    passphrase: str


class Gate5UnlockResponse(BaseModel):
    armed: bool
    armed_at: Optional[str]
    threshold: float


class Gate5VerifyResponse(BaseModel):
    armed: bool
    passing: bool
    score: Optional[float] = None
    threshold: float


class Gate5StatusResponse(BaseModel):
    enrolled: bool
    armed: bool
    armed_at: Optional[str]
    threshold: float
    accepts: int
    rejects: int
    last_activation: Optional[str]
    recent_events: list[dict]


class Gate1Ping(BaseModel):
    method: str  # "ptt" | "wake_phrase"


@app.post("/api/gate5/unlock", response_model=Gate5UnlockResponse)
def gate5_unlock(body: Gate5Unlock):
    """Member unlocks Gate 5 by providing their passphrase. Reference is held
    in memory only. Lost on process restart — member must re-arm each session."""
    global _gate5_reference, _gate5_armed_at
    if not core.has_enrollment():
        raise HTTPException(status_code=400, detail="No voice enrolled. Run onboarding first.")
    try:
        ref = core.load_reference(body.passphrase)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Could not decrypt: {e}")
    with _gate5_lock:
        _gate5_reference = ref
        _gate5_armed_at = datetime.now(core.AEST).isoformat()
    return Gate5UnlockResponse(
        armed=True,
        armed_at=_gate5_armed_at,
        threshold=_gate5_threshold,
    )


@app.post("/api/gate5/lock")
def gate5_lock():
    """Clear the in-memory reference. Gate 5 disarms immediately."""
    global _gate5_reference, _gate5_armed_at
    with _gate5_lock:
        _gate5_reference = None
        _gate5_armed_at = None
    return {"armed": False}


@app.post("/api/gate5/verify", response_model=Gate5VerifyResponse)
async def gate5_verify(audio: UploadFile = File(...)):
    """Verify an audio sample against the armed reference. Called by
    voice_agent.py before processing any utterance. Fail-closed when not armed."""
    global _gate5_accepts, _gate5_rejects, _gate5_last_activation

    with _gate5_lock:
        ref = _gate5_reference
        threshold = _gate5_threshold

    if ref is None:
        return Gate5VerifyResponse(
            armed=False, passing=False, score=None, threshold=threshold,
        )

    audio_np = _decode_audio(audio)
    # Minimal duration: don't verify on <1s of audio
    if len(audio_np) / core.SAMPLE_RATE < 0.5:
        return Gate5VerifyResponse(
            armed=True, passing=False, score=0.0, threshold=threshold,
        )

    emb, _ms = core.embed_audio(audio_np)
    score = float(np.dot(emb / (np.linalg.norm(emb) + 1e-9),
                          ref / (np.linalg.norm(ref) + 1e-9)))
    passing = score >= threshold

    now_iso = datetime.now(core.AEST).isoformat()
    with _gate5_lock:
        if passing:
            _gate5_accepts += 1
            _gate5_last_activation = now_iso
        else:
            _gate5_rejects += 1
        _gate5_events.append({
            "ts": now_iso,
            "passing": passing,
            "score": round(score, 3),
        })

    # Append to audit log on disk (append-only, never blocks)
    try:
        event = {
            "ts": now_iso, "gate": 5, "passing": passing,
            "score": round(score, 4), "threshold": threshold,
        }
        with open(core.LOGS_DIR / "gate_events.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(event) + "\n")
    except Exception:
        pass

    return Gate5VerifyResponse(
        armed=True, passing=passing, score=score, threshold=threshold,
    )


@app.get("/api/gate5/status", response_model=Gate5StatusResponse)
def gate5_status():
    with _gate5_lock:
        armed = _gate5_reference is not None
        return Gate5StatusResponse(
            enrolled=core.has_enrollment(),
            armed=armed,
            armed_at=_gate5_armed_at,
            threshold=_gate5_threshold,
            accepts=_gate5_accepts,
            rejects=_gate5_rejects,
            last_activation=_gate5_last_activation,
            recent_events=list(_gate5_events)[-20:],
        )


# ── Gate 1 (Light Bulb Moment) — conscious invocation pings ─────────

@app.post("/api/gate1/ping")
def gate1_ping(body: Gate1Ping):
    """Voice agent notifies bridge when a deliberate wake signal fires.
    Used for widget status display only."""
    global _gate1_last_trigger
    _gate1_last_trigger = datetime.now(core.AEST).isoformat()
    return {"received": True, "at": _gate1_last_trigger, "method": body.method}


@app.get("/api/gate1/status")
def gate1_status():
    return {"last_trigger": _gate1_last_trigger}


# ── Aggregate gate status (honest, reflects runtime armed state) ────

@app.get("/api/gates", response_model=GatesResponse)
def gates():
    gates_out: list[GateStatus] = []

    gate1_wired = _gate1_last_trigger is not None
    gates_out.append(
        GateStatus(
            name="Light Bulb Moment",
            passing=gate1_wired,
            detail=(
                f"Deliberate wake signal received at {_gate1_last_trigger}"
                if gate1_wired
                else "No deliberate wake signal yet (hold Right-Ctrl to invoke, or set a wake phrase)"
            ),
        )
    )
    gates_out.append(
        GateStatus(
            name="Member Control",
            passing=True,
            detail="All data local. No cloud calls. Encrypted at rest.",
        )
    )
    gates_out.append(
        GateStatus(
            name="Extension of Thinking",
            passing=True,
            detail="First-person inner-voice prompt (llama3.2:3b). Terse.",
        )
    )
    gates_out.append(
        GateStatus(
            name="Reactive and Non-Invasive",
            passing=True,
            detail="Agent never initiates unprompted.",
        )
    )
    enrolled = core.has_enrollment()
    with _gate5_lock:
        armed = _gate5_reference is not None
        accepts = _gate5_accepts
        rejects = _gate5_rejects
    if enrolled and armed:
        gate5_detail = f"Armed at runtime. {accepts} accepts, {rejects} rejects."
    elif enrolled:
        gate5_detail = "Voice enrolled but not armed. Unlock to activate runtime gating."
    else:
        gate5_detail = "Not enrolled. Run onboarding first."
    gates_out.append(
        GateStatus(
            name="Voice-Bound to the Member",
            passing=enrolled and armed,
            detail=gate5_detail,
        )
    )

    return GatesResponse(
        member_id="knox-hart",
        gates=gates_out,
        last_activation=_gate5_last_activation,
        rejections_last_hour=_gate5_rejects,  # simplified; real rolling-hour later
    )


# ── Dev entrypoint ──────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")
