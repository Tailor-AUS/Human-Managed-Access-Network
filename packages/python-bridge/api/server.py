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

import asyncio
import io
import json
import os
import secrets
import sys
import threading
import time
from collections import deque
from contextlib import asynccontextmanager
from dataclasses import asdict, is_dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
import traceback
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel

# Make sibling module importable when run as script (api/server.py → ../core.py)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import core  # noqa: E402


# ── Lifespan: auto-start sensors on boot ────────────────────────────
#
# Issue #21: every bridge restart used to leave all sensors idle until
# someone hit /api/sensors/start_all. Now we kick start_all ourselves
# at startup, but in a background thread so uvicorn's "ready" signal
# doesn't wait on Whisper's first-load (~5s) or the EEG BLE handshake
# (~20s timeout). The /api/health probe stays responsive throughout.
#
# Per-sensor opt-out is honoured via env (HMAN_SENSOR_<NAME>=off) and
# ~/.hman/sensors.yaml — see config.py.

@asynccontextmanager
async def lifespan(_app: "FastAPI"):
    # Import here so a circular-import or missing-sensor-dep can't kill
    # the whole bridge before we even reach the startup hook.
    try:
        import sensors as _s
        threading.Thread(
            target=_s.autostart_all,
            name="hman-sensor-autostart",
            daemon=True,
        ).start()
    except Exception as e:
        # Last-resort net: a bug in autostart wiring must NEVER block
        # the bridge from coming up. Voice enrollment / Gate 5 stay
        # functional even if the subconscious never starts.
        print(f"[startup] sensor auto-start scheduling failed: {e}")
        traceback.print_exc()
    yield
    # No shutdown work — daemon threads die with the process. Existing
    # /api/sensors/stop_all is still available for graceful teardown.


app = FastAPI(title=".HMAN Member Bridge", version="0.1.0", lifespan=lifespan)

# Allowed origins:
#   dev (localhost)
#   anything listed in HMAN_ALLOWED_ORIGINS (comma-separated) for production
_default_origins = ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173"]
_extra = os.environ.get("HMAN_ALLOWED_ORIGINS", "").strip()
_allowed_origins = _default_origins + [o.strip() for o in _extra.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Bearer-token auth for remote use ────────────────────────────────
#
# Set HMAN_AUTH_TOKEN in the environment. If unset, auth is DISABLED
# (dev only). When set, every /api/* request must carry
# "Authorization: Bearer <token>" or it gets 401. Keeps the bridge
# closed when reachable over a tunnel or public URL.
_AUTH_TOKEN = os.environ.get("HMAN_AUTH_TOKEN", "").strip() or None

_PUBLIC_PATHS = {
    "/",
    "/openapi.json",
    "/docs",
    "/redoc",
    "/docs/oauth2-redirect",
    # QR-pairing endpoints — phone has no token yet, that's the whole point
    "/api/pair/begin",
    "/api/pair/redeem",
}


def _cors_headers_for(origin: str | None) -> dict[str, str]:
    """Return the CORS response headers browsers need to see on rejected
    responses. Starlette's CORSMiddleware wraps successful responses, but
    when we short-circuit with a JSONResponse here, the wrapping is skipped.
    We add the headers manually so 401/403 responses are CORS-compliant."""
    if not origin:
        return {}
    # Match against the configured allow-list; wildcard-prefix matches ('https://*.foo')
    def allowed(candidate: str) -> bool:
        if candidate == "*":
            return True
        if candidate.startswith("https://*."):
            suffix = candidate[len("https://*."):]
            return origin.startswith("https://") and origin.endswith("." + suffix)
        return candidate == origin

    if any(allowed(o) for o in _allowed_origins):
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
        }
    return {}


# Catch-all exception handler so uncaught errors get CORS headers too.
# Without this, Starlette's ServerErrorMiddleware (outermost, above
# CORSMiddleware) produces a 500 response that the browser sees as a
# CORS failure ("No 'Access-Control-Allow-Origin' header is present"),
# hiding the real error.
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Log so ops/run-relay-listener.ps1 output shows the stack trace.
    print(f"[unhandled] {request.method} {request.url.path}: {type(exc).__name__}: {exc}")
    traceback.print_exc()
    origin = request.headers.get("origin")
    cors_headers = _cors_headers_for(origin)
    return JSONResponse(
        status_code=500,
        content={
            "detail": f"internal error: {type(exc).__name__}: {str(exc)[:300]}",
        },
        headers=cors_headers,
    )


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # No token configured → dev mode, everything open
    if _AUTH_TOKEN is None:
        return await call_next(request)
    # (JSONResponse imported at module top)
    # Public paths (docs, schema) stay open
    if request.url.path in _PUBLIC_PATHS or not request.url.path.startswith("/api/"):
        return await call_next(request)
    # Preflight CORS must not be gated — browser never attaches auth to OPTIONS
    if request.method == "OPTIONS":
        return await call_next(request)

    origin = request.headers.get("origin")
    cors_headers = _cors_headers_for(origin)

    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        return JSONResponse(
            status_code=401,
            content={"detail": "missing bearer token"},
            headers=cors_headers,
        )
    submitted = header[len("Bearer "):].strip()
    if not secrets.compare_digest(submitted, _AUTH_TOKEN):
        return JSONResponse(
            status_code=401,
            content={"detail": "invalid bearer token"},
            headers=cors_headers,
        )
    return await call_next(request)

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
    member_id: str = "member"


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
    # torch import can fail with DLL errors on Windows if the install is
    # mismatched against the local CUDA runtime — degrade to gpu=False
    # rather than crash the health probe.
    gpu = False
    try:
        import torch
        gpu = torch.cuda.is_available()
    except Exception:
        gpu = False
    return HealthResponse(
        ok=True,
        version="0.1.0",
        gpu=gpu,
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
        member_id="member",
        gates=gates_out,
        last_activation=_gate5_last_activation,
        rejections_last_hour=_gate5_rejects,  # simplified; real rolling-hour later
    )


# ── In-PWA voice loop (Wave 1, issue #9) ────────────────────────────
#
# Push-to-talk in the web dashboard:
#     MediaRecorder webm/opus blob
#  →  POST /api/audio/transcribe         (faster-whisper)
#  →  POST /api/voice/respond            (Ollama → reply text + optional Piper TTS)
#  →  GET  /api/voice/audio/{token}      (one-shot signed URL, ~60s)
#
# Foreground only on iOS — that's a known PWA constraint and Wave 1
# explicitly accepts it. Background capture is Wave 2 (native).
#
# TTS: if a Piper ONNX voice is present at $HMAN_TTS_MODEL (or
# ~/.hman/tts/en_US-amy-medium.onnx by default) AND the `piper-tts`
# CLI is on PATH, /api/voice/respond will synthesize and return a
# tts_url. Otherwise tts_url is null and the frontend falls back to
# Web Speech Synthesis (window.speechSynthesis). Either path is
# acceptable for v1.

_VOICE_MODEL = os.environ.get("HMAN_VOICE_MODEL", "llama3.2:3b").strip() or "llama3.2:3b"
_OLLAMA_URL = os.environ.get("HMAN_OLLAMA_URL", "http://localhost:11434").rstrip("/")
_TTS_MODEL_PATH = Path(
    os.environ.get(
        "HMAN_TTS_MODEL",
        str(Path.home() / ".hman" / "tts" / "en_US-amy-medium.onnx"),
    )
).expanduser()
_TTS_DIR = core.HMAN_DIR / "voice_audio"
_TTS_DIR.mkdir(parents=True, exist_ok=True)
_TTS_MAX_AGE_S = 60.0

# token → (Path, expires_at_epoch). One-shot; popped on first GET.
_tts_tokens: dict[str, tuple[Path, float]] = {}
_tts_lock = threading.Lock()


class TranscribeResponse(BaseModel):
    text: str
    duration_s: float
    rms: float


class VoiceRespondRequest(BaseModel):
    text: str
    context: Optional[str] = None


class VoiceRespondResponse(BaseModel):
    reply: str
    tts_url: Optional[str] = None


def _piper_available() -> bool:
    """True if Piper CLI is on PATH and a voice model exists locally."""
    import shutil
    return shutil.which("piper") is not None and _TTS_MODEL_PATH.exists()


def _synthesize_piper(text: str) -> Optional[Path]:
    """Run piper to a temp wav. Returns the path on success, None on any failure
    (caller falls back to Web Speech Synthesis on the client)."""
    if not _piper_available():
        return None
    import subprocess
    out_path = _TTS_DIR / f"reply_{secrets.token_hex(8)}.wav"
    try:
        proc = subprocess.run(
            ["piper", "--model", str(_TTS_MODEL_PATH), "--output_file", str(out_path)],
            input=text.encode("utf-8"),
            capture_output=True,
            timeout=20,
        )
        if proc.returncode != 0 or not out_path.exists():
            return None
        return out_path
    except Exception:
        return None


def _gc_tts_tokens() -> None:
    """Drop expired tokens and unlink their files. Called on each issue."""
    now = time.time()
    with _tts_lock:
        dead = [t for t, (_, exp) in _tts_tokens.items() if exp < now]
        for t in dead:
            path, _ = _tts_tokens.pop(t, (None, 0))
            if path:
                try:
                    path.unlink(missing_ok=True)
                except Exception:
                    pass


def _ollama_chat_sync(prompt: str, context: Optional[str]) -> str:
    """Blocking Ollama call. Run via asyncio.to_thread() from async handlers
    so the event loop keeps serving other requests during inference."""
    import requests
    messages = []
    if context:
        messages.append({"role": "system", "content": context})
    else:
        messages.append({
            "role": "system",
            "content": (
                "You are HMAN, the member's local subconscious. Reply briefly "
                "and in plain spoken language — one or two short sentences. "
                "Never mention being an AI."
            ),
        })
    messages.append({"role": "user", "content": prompt})
    r = requests.post(
        f"{_OLLAMA_URL}/api/chat",
        json={"model": _VOICE_MODEL, "messages": messages, "stream": False},
        timeout=60,
    )
    r.raise_for_status()
    body = r.json()
    return (body.get("message", {}).get("content") or "").strip()


@app.post("/api/audio/transcribe", response_model=TranscribeResponse)
async def audio_transcribe(audio: UploadFile = File(...)):
    """Transcribe a single push-to-talk blob (webm/opus or wav).

    Returns text + audio stats. Reuses ``core.transcribe_audio``, the
    same path the ambient audio sensor uses, so the model loads once
    per process.
    """
    audio_np = _decode_audio(audio)
    result = await asyncio.to_thread(core.transcribe_audio, audio_np)
    return TranscribeResponse(**result)


@app.post("/api/voice/respond", response_model=VoiceRespondResponse)
async def voice_respond(body: VoiceRespondRequest):
    """LLM reply for an utterance, optionally with synthesized audio.

    Always returns the reply text. ``tts_url`` is non-null only when
    Piper is available locally — otherwise the client falls back to
    Web Speech Synthesis.
    """
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="empty utterance")

    try:
        reply = await asyncio.to_thread(_ollama_chat_sync, body.text, body.context)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"ollama unreachable: {type(e).__name__}: {str(e)[:200]}",
        )
    if not reply:
        reply = "(no reply)"

    tts_url: Optional[str] = None
    if _piper_available():
        wav_path = await asyncio.to_thread(_synthesize_piper, reply)
        if wav_path is not None:
            tok = secrets.token_urlsafe(24)
            with _tts_lock:
                _tts_tokens[tok] = (wav_path, time.time() + _TTS_MAX_AGE_S)
            _gc_tts_tokens()
            tts_url = f"/api/voice/audio/{tok}"

    return VoiceRespondResponse(reply=reply, tts_url=tts_url)


def _unlink_silent(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except Exception:
        pass


@app.get("/api/voice/audio/{tok}")
async def voice_audio(tok: str):
    """One-shot signed audio URL. Token is consumed on first read and the
    underlying wav is unlinked once streaming completes, so the client
    must download in one go."""
    _gc_tts_tokens()
    with _tts_lock:
        entry = _tts_tokens.pop(tok, None)
    if entry is None:
        raise HTTPException(status_code=404, detail="audio expired or already consumed")
    path, _exp = entry
    if not path.exists():
        raise HTTPException(status_code=404, detail="audio missing on disk")
    return FileResponse(
        str(path),
        media_type="audio/wav",
        filename=path.name,
        background=BackgroundTask(_unlink_silent, path),
    )


# ── Sensors (the subconscious) ──────────────────────────────────────
#
# Unified sensor API: every sensor (audio, keystrokes, screen, eeg)
# exposes the same shape — /status, /start, /stop, /recent. The
# subconscious page in the dashboard drives these.

import sensors as _sensors  # noqa: E402

# APNs push channel (issue #17). Mounted as a sub-router so its routes
# pick up the same auth + CORS middleware as everything else.
import push as _push  # noqa: E402
app.include_router(_push.router)


# Every sensor read endpoint runs the sensor's status()/recent() under
# asyncio.to_thread. These methods are sync and may touch deques or do
# small filesystem reads; running them inline on the event loop is what
# allowed issue #22 — a single slow Win32 enumeration call inside
# ScreenSensor.summary() blocked the entire FastAPI loop indefinitely
# while sensor threads kept happily writing to disk. to_thread keeps
# the event loop free even if a sensor's status() call is slow.

def _all_sensor_statuses() -> list[dict]:
    return [s.status() for s in _sensors.all_sensors()]


@app.get("/api/sensors")
async def sensors_list():
    """List every sensor and its current status (for the Subconscious page)."""
    return await asyncio.to_thread(_all_sensor_statuses)


@app.get("/api/sensors/{name}/status")
async def sensor_status(name: str):
    s = _sensors.get(name)
    if s is None:
        raise HTTPException(status_code=404, detail=f"unknown sensor: {name}")
    return await asyncio.to_thread(s.status)


@app.post("/api/sensors/{name}/start")
async def sensor_start(name: str):
    s = _sensors.get(name)
    if s is None:
        raise HTTPException(status_code=404, detail=f"unknown sensor: {name}")
    s.start()
    return await asyncio.to_thread(s.status)


@app.post("/api/sensors/{name}/stop")
async def sensor_stop(name: str):
    s = _sensors.get(name)
    if s is None:
        raise HTTPException(status_code=404, detail=f"unknown sensor: {name}")
    s.stop()
    return await asyncio.to_thread(s.status)


@app.get("/api/sensors/{name}/recent")
async def sensor_recent(name: str, seconds: int = 3600):
    s = _sensors.get(name)
    if s is None:
        raise HTTPException(status_code=404, detail=f"unknown sensor: {name}")
    # recent() reads JSONL files from disk — must not block the loop.
    return await asyncio.to_thread(s.recent, seconds)


def _start_all_sensors() -> list[dict]:
    for s in _sensors.all_sensors():
        if s.available():
            s.start()
    return [s.status() for s in _sensors.all_sensors()]


def _stop_all_sensors() -> list[dict]:
    for s in _sensors.all_sensors():
        s.stop()
    return [s.status() for s in _sensors.all_sensors()]


@app.post("/api/sensors/start_all")
async def sensors_start_all():
    """Turn on every available sensor."""
    return await asyncio.to_thread(_start_all_sensors)


@app.post("/api/sensors/stop_all")
async def sensors_stop_all():
    return await asyncio.to_thread(_stop_all_sensors)


# ── Receptivity gate ────────────────────────────────────────────────
#
# Channel-aware consent gate: decides *when* and *how* to surface a
# pending intention to the member (voice whisper / Signal text / queue).

import receptivity as _receptivity  # noqa: E402


class IntentionIn(BaseModel):
    id: str
    description: str
    urgency: str = "normal"          # low | normal | high | critical
    source: str = "unknown"
    context: Optional[str] = None
    estimated_voice_words: int = 15


class SensorStateIn(BaseModel):
    """Optional snapshot the caller can supply.  When omitted the bridge
    reads the live sensor singletons via ``aggregate_signals()``."""
    idle_seconds: Optional[float] = None
    typing_wpm: Optional[float] = None
    active_app: Optional[str] = None
    screen_locked: Optional[bool] = None
    signal_active: Optional[bool] = None
    room_rms: Optional[float] = None
    speech_active: Optional[bool] = None
    in_meeting: Optional[bool] = None
    confidence: float = 0.0


class EvaluateRequest(BaseModel):
    intention: IntentionIn
    sensor_state: Optional[SensorStateIn] = None  # None → use live sensors


class GateDecisionOut(BaseModel):
    surface_now: bool
    channel: str           # "voice" | "text" | "queue"
    reason: str
    score: float
    budget_words_remaining: int
    budget_interruptions_today: int


class BudgetOut(BaseModel):
    daily_word_limit: int
    words_used_today: int
    words_remaining: int
    interruptions_today: int
    max_interruptions: int
    budget_exhausted: bool


class RecordVoiceUsageIn(BaseModel):
    words: int


@app.post("/api/receptivity/evaluate", response_model=GateDecisionOut)
def receptivity_evaluate(body: EvaluateRequest):
    """Evaluate whether to surface *intention* right now and through which channel.

    The caller (e.g. PACT-GitHub connector) passes an ``Intention`` and
    optionally a ``SensorState``.  When ``sensor_state`` is omitted the
    bridge reads the live sensor singletons.

    Returns a ``GateDecision`` plus current budget metadata.
    """
    intention = _receptivity.Intention(
        id=body.intention.id,
        description=body.intention.description,
        urgency=body.intention.urgency,  # type: ignore[arg-type]
        source=body.intention.source,
        context=body.intention.context,
        estimated_voice_words=body.intention.estimated_voice_words,
    )

    if body.sensor_state is not None:
        sensor_state = _receptivity.SensorState(
            idle_seconds=body.sensor_state.idle_seconds,
            typing_wpm=body.sensor_state.typing_wpm,
            active_app=body.sensor_state.active_app,
            screen_locked=body.sensor_state.screen_locked,
            signal_active=body.sensor_state.signal_active,
            room_rms=body.sensor_state.room_rms,
            speech_active=body.sensor_state.speech_active,
            in_meeting=body.sensor_state.in_meeting,
            confidence=body.sensor_state.confidence,
        )
    else:
        sensor_state = _receptivity.aggregate_signals()

    budget = _receptivity.load_budget()
    decision = _receptivity.receptivity_gate(intention, sensor_state, budget)

    return GateDecisionOut(
        surface_now=decision.surface_now,
        channel=decision.channel,
        reason=decision.reason,
        score=decision.score,
        budget_words_remaining=budget.words_remaining,
        budget_interruptions_today=budget.interruptions_today,
    )


@app.get("/api/receptivity/budget", response_model=BudgetOut)
def receptivity_budget():
    """Return the current daily voice-word budget."""
    b = _receptivity.load_budget()
    return BudgetOut(
        daily_word_limit=b.daily_word_limit,
        words_used_today=b.words_used_today,
        words_remaining=b.words_remaining,
        interruptions_today=b.interruptions_today,
        max_interruptions=b.max_interruptions,
        budget_exhausted=b.budget_exhausted,
    )


@app.post("/api/receptivity/budget/use", response_model=BudgetOut)
def receptivity_budget_use(body: RecordVoiceUsageIn):
    """Record *words* spoken aloud and increment the interruption counter.

    Call this after each successful voice whisper so the daily budget
    stays accurate.
    """
    updated = _receptivity.record_voice_usage(body.words)
    return BudgetOut(
        daily_word_limit=updated.daily_word_limit,
        words_used_today=updated.words_used_today,
        words_remaining=updated.words_remaining,
        interruptions_today=updated.interruptions_today,
        max_interruptions=updated.max_interruptions,
        budget_exhausted=updated.budget_exhausted,
    )


# ── QR-code pairing (Wave 1) ────────────────────────────────────────
#
# A new phone joining the deployment shouldn't have to read or copy-paste
# a 48-char hex token. The desktop dashboard renders a QR encoding a
# one-time pairing URL; the phone scans → SWA hits /redeem → bearer
# token transfers automatically.
#
# Both endpoints are auth-exempt (see _PUBLIC_PATHS) — they are the
# bootstrap path for a device that has nothing yet. Defenses in depth:
#   - Codes are 6 chars from a 32-char confusable-free alphabet (~32^6
#     ≈ 1B). Brute-force at 3 attempts per code is hopeless.
#   - 60s TTL is the security ceiling.
#   - Single-use; redeemed codes are dropped immediately.
#   - Begin-rate limit: 10/min per remote IP.
#   - State is in-process only — never written to disk or vault.

class PairBeginResponse(BaseModel):
    code: str
    url: str
    expires_at: float   # unix epoch seconds


class PairRedeemRequest(BaseModel):
    code: str


class PairRedeemResponse(BaseModel):
    token: str


def _log_pair_event(event: str, **fields) -> None:
    """Append a pairing event to gate_events.jsonl (the existing audit log)."""
    record = {
        "ts": datetime.now(core.AEST).isoformat(),
        "gate": "pair",
        "event": event,
        **fields,
    }
    try:
        with open(core.LOGS_DIR / "gate_events.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
    except Exception:
        pass


def _pair_remote_ip(request: Request) -> str:
    """Best-effort remote IP. Honours X-Forwarded-For when present (relay)."""
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


@app.post("/api/pair/begin", response_model=PairBeginResponse)
async def pair_begin(request: Request):
    """Mint a fresh 6-char pairing code with 60s TTL.

    The phone hits /redeem?code=XXXXXX with the returned URL. If
    HMAN_AUTH_TOKEN is unset (dev mode), the redeemed token is the
    empty string — the dev bridge accepts that anyway.
    """
    remote_ip = _pair_remote_ip(request)

    # Determine the base URL the phone should hit. Prefer explicit
    # HMAN_PUBLIC_URL so the SWA origin is correct in production; fall
    # back to the request's own origin (good enough for dev / LAN).
    base_url = (
        os.environ.get("HMAN_PUBLIC_URL", "").strip()
        or request.headers.get("origin", "").strip()
        or f"{request.url.scheme}://{request.url.netloc}"
    )

    # In dev mode the bearer token may be empty. That's fine — the dev
    # bridge has auth disabled, so the phone won't need a token to talk
    # to it. Still hand back a placeholder so the redeem flow is uniform.
    bearer = _AUTH_TOKEN or ""

    try:
        entry, redeem_url = core.begin_pairing(
            token=bearer, base_url=base_url, remote_ip=remote_ip
        )
    except ValueError as e:
        _log_pair_event("begin_rate_limited", remote_ip=remote_ip, reason=str(e))
        raise HTTPException(status_code=429, detail="too many pairing requests")

    _log_pair_event("begin", remote_ip=remote_ip, expires_in=core.PAIRING_TTL_SECONDS)
    return PairBeginResponse(
        code=entry.code,
        url=redeem_url,
        expires_at=entry.expires_at,
    )


@app.post("/api/pair/redeem", response_model=PairRedeemResponse)
async def pair_redeem(body: PairRedeemRequest, request: Request):
    """Single-use redemption. Returns the bearer token on success.

    The phone calls this after scanning the QR. On success the response
    contains the token to put in localStorage; on any failure mode
    (expired, redeemed, unknown, exhausted attempts) the phone should
    show the failure reason and prompt the user to start over on
    desktop.
    """
    remote_ip = _pair_remote_ip(request)
    code = (body.code or "").strip().upper()
    try:
        token = core.redeem_pairing(code)
    except core.PairingError as e:
        _log_pair_event(
            "redeem_fail",
            remote_ip=remote_ip,
            code_prefix=code[:2] if code else "",
            reason=e.reason,
        )
        raise HTTPException(status_code=e.status, detail=e.reason)

    _log_pair_event("redeem_success", remote_ip=remote_ip, code_prefix=code[:2])
    return PairRedeemResponse(token=token)


# ── Connectors (PACT-mediated external actions) ─────────────────────
#
# First implementation: PACT-GitHub. The connector's draft/execute path
# is gated by Gate 5 freshness — the consent moment must be backed by
# a recent voice-biometric activation. We register a freshness check
# that the connectors module calls on every draft/execute request.

from api import connectors as _connectors_router  # noqa: E402


def _gate5_freshness_check() -> tuple[bool, str]:
    """Return ``(ok, reason)`` for the connector module.

    ``ok`` is True iff Gate 5 is armed AND the last accepting activation
    is within ``GATE5_FRESHNESS_SECONDS`` of *now*. This is the
    "is this still really the member" check the connector spec calls
    for at the consent moment.
    """
    with _gate5_lock:
        armed = _gate5_reference is not None
        last = _gate5_last_activation
    if not armed:
        return False, "Gate 5 not armed (call /api/gate5/unlock first)"
    if last is None:
        return False, "Gate 5 has no recent successful activation"
    try:
        last_dt = datetime.fromisoformat(last)
        now = datetime.now(last_dt.tzinfo) if last_dt.tzinfo else datetime.now()
        delta = (now - last_dt).total_seconds()
    except Exception:
        return False, "Gate 5 last activation timestamp unparseable"
    if delta > _connectors_router.GATE5_FRESHNESS_SECONDS:
        return (
            False,
            f"Gate 5 last activation {int(delta)}s ago, "
            f"freshness window {_connectors_router.GATE5_FRESHNESS_SECONDS}s",
        )
    return True, "fresh"


_connectors_router.configure_gate5_check(_gate5_freshness_check)
app.include_router(_connectors_router.router)


# ── Dev entrypoint ──────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")
