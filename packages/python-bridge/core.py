"""
.HMAN — core identity + enrollment primitives.

Shared library used by:
  - enrollment/enroll_voice.py   (CLI enrollment for headless use)
  - api/server.py                 (local HTTP bridge for the web frontend)

Data directory resolution:
  Honours the HMAN_DATA_DIR environment variable. Falls back to
  ~/.hman on the user's home directory. Create this dir manually
  if you want a specific location (e.g. for disk encryption).

Core responsibilities:
  - Load and run the voice encoder (resemblyzer, CUDA if available)
  - Audit an incoming audio sample (duration, RMS, peaks)
  - Compute a voice embedding
  - Encrypt/decrypt a reference embedding at rest (Fernet + PBKDF2)
  - Write tamper-evident audit logs
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import threading
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import numpy as np
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


# ── Paths ───────────────────────────────────────────────────────────

# Data directory: env override, otherwise ~/.hman on the user's home
_data_env = os.environ.get("HMAN_DATA_DIR")
HMAN_DIR = Path(_data_env).expanduser().resolve() if _data_env else (
    Path.home() / ".hman"
)
IDENTITY_DIR = HMAN_DIR / "identity"
ENROLLMENT_DIR = HMAN_DIR / "enrollment"
LOGS_DIR = HMAN_DIR / "logs"

HMAN_DIR.mkdir(parents=True, exist_ok=True)
IDENTITY_DIR.mkdir(parents=True, exist_ok=True)
ENROLLMENT_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)

AEST = timezone(timedelta(hours=10))


# ── Audio audit ─────────────────────────────────────────────────────

SAMPLE_RATE = 16000
MIN_DURATION = 2.0
MAX_DURATION = 12.0
RMS_MIN = 0.01
RMS_MAX = 0.40
PEAK_CLIP = 0.98


@dataclass
class SampleAudit:
    ok: bool
    reason: str
    duration_s: float
    rms: float
    peak: float


def audit_sample(audio: np.ndarray) -> SampleAudit:
    """Run audio quality checks before embedding."""
    dur = len(audio) / SAMPLE_RATE
    rms = float(np.sqrt(np.mean(audio ** 2))) if len(audio) else 0.0
    peak = float(np.max(np.abs(audio))) if len(audio) else 0.0
    if dur < MIN_DURATION:
        return SampleAudit(False, f"too short ({dur:.1f}s < {MIN_DURATION}s)", dur, rms, peak)
    if dur > MAX_DURATION:
        return SampleAudit(False, f"too long ({dur:.1f}s > {MAX_DURATION}s)", dur, rms, peak)
    if rms < RMS_MIN:
        return SampleAudit(False, f"too quiet (RMS {rms:.4f})", dur, rms, peak)
    if rms > RMS_MAX:
        return SampleAudit(False, f"clipping (RMS {rms:.4f})", dur, rms, peak)
    if peak > PEAK_CLIP:
        return SampleAudit(False, f"peaks clipped ({peak:.3f})", dur, rms, peak)
    return SampleAudit(True, f"ok dur={dur:.1f}s rms={rms:.3f} peak={peak:.2f}", dur, rms, peak)


# ── Voice encoder (lazy-loaded singleton) ───────────────────────────

_encoder = None
_encoder_lock = threading.Lock()


def get_encoder(device: str | None = None):
    """Return a cached resemblyzer VoiceEncoder. CUDA if available."""
    global _encoder
    with _encoder_lock:
        if _encoder is None:
            try:
                import torch
                auto_device = "cuda" if torch.cuda.is_available() else "cpu"
            except Exception:
                auto_device = "cpu"
            from resemblyzer import VoiceEncoder
            _encoder = VoiceEncoder(device=device or auto_device, verbose=False)
        return _encoder


def embed_audio(audio: np.ndarray) -> tuple[np.ndarray, float]:
    """Embed a numpy float32 audio array. Returns (embedding, ms)."""
    from resemblyzer import preprocess_wav
    wav = preprocess_wav(audio, source_sr=SAMPLE_RATE)
    enc = get_encoder()
    t0 = time.time()
    emb = enc.embed_utterance(wav)
    return emb.astype(np.float32), (time.time() - t0) * 1000


# ── Speech-to-text (faster-whisper, lazy-loaded singleton) ──────────
#
# Shared by the audio sensor (30s ambient chunks) and the PWA voice
# loop (push-to-talk utterances). Loading the model is slow (~3-5s on
# first call), so we keep one instance per process.

_whisper_model = None
_whisper_lock = threading.Lock()
_WHISPER_SIZE = os.environ.get("HMAN_WHISPER_MODEL", "base").strip() or "base"


def get_whisper():
    """Return a cached faster-whisper WhisperModel."""
    global _whisper_model
    with _whisper_lock:
        if _whisper_model is None:
            from faster_whisper import WhisperModel
            _whisper_model = WhisperModel(
                _WHISPER_SIZE, device="cpu", compute_type="int8",
            )
        return _whisper_model


def transcribe_audio(audio: np.ndarray, language: str = "en") -> dict:
    """Transcribe a mono float32 16 kHz numpy array.

    Returns ``{ "text": str, "duration_s": float, "rms": float }``.
    Reused by both the audio sensor and the PWA push-to-talk endpoint
    so the transcribe path stays in one place.
    """
    duration_s = float(len(audio)) / SAMPLE_RATE if len(audio) else 0.0
    rms = float(np.sqrt(np.mean(audio ** 2))) if len(audio) else 0.0
    if duration_s < 0.2 or rms < 1e-4:
        # Too short or pure silence — skip the model entirely
        return {"text": "", "duration_s": round(duration_s, 3), "rms": round(rms, 4)}
    model = get_whisper()
    segments, _info = model.transcribe(audio, language=language, beam_size=1)
    text = " ".join(seg.text for seg in segments).strip()
    return {
        "text": text,
        "duration_s": round(duration_s, 3),
        "rms": round(rms, 4),
    }


# ── Reference embedding persistence (Fernet + PBKDF2) ───────────────

PBKDF2_ITERATIONS = 600_000
VOICE_FILE = IDENTITY_DIR / "voice_embedding.enc"


def _derive_key(passphrase: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(), length=32, salt=salt, iterations=PBKDF2_ITERATIONS
    )
    return base64.urlsafe_b64encode(kdf.derive(passphrase.encode("utf-8")))


def save_reference(embedding: np.ndarray, passphrase: str, meta: dict) -> Path:
    """Encrypt a 256-dim reference embedding and write to disk."""
    salt = os.urandom(16)
    key = _derive_key(passphrase, salt)
    f = Fernet(key)
    payload = {
        "schema": "hman-voice-identity/v1",
        "member_id": meta.get("member_id"),
        "model": meta.get("model", "resemblyzer"),
        "dim": int(embedding.shape[0]),
        "sample_rate": SAMPLE_RATE,
        "created_at": meta.get("created_at"),
        "samples_used": meta.get("samples_used"),
        "embedding_b64": base64.b64encode(embedding.astype(np.float32).tobytes()).decode("ascii"),
    }
    ciphertext = f.encrypt(json.dumps(payload).encode("utf-8"))
    envelope = {
        "schema": "hman-voice-envelope/v1",
        "kdf": "pbkdf2-sha256",
        "iterations": PBKDF2_ITERATIONS,
        "salt_b64": base64.b64encode(salt).decode("ascii"),
        "ciphertext_b64": base64.b64encode(ciphertext).decode("ascii"),
    }
    VOICE_FILE.write_text(json.dumps(envelope, indent=2), encoding="utf-8")
    try:
        os.chmod(VOICE_FILE, 0o600)
    except Exception:
        pass
    return VOICE_FILE


def load_reference(passphrase: str) -> np.ndarray:
    """Decrypt and load the reference embedding."""
    envelope = json.loads(VOICE_FILE.read_text(encoding="utf-8"))
    salt = base64.b64decode(envelope["salt_b64"])
    key = _derive_key(passphrase, salt)
    f = Fernet(key)
    plaintext = f.decrypt(base64.b64decode(envelope["ciphertext_b64"]))
    payload = json.loads(plaintext)
    raw = base64.b64decode(payload["embedding_b64"])
    return np.frombuffer(raw, dtype=np.float32)


def has_enrollment() -> bool:
    return VOICE_FILE.exists()


# ── Enrollment session state ────────────────────────────────────────

@dataclass
class CollectedSample:
    index: int
    prompt: str
    duration_s: float
    rms: float
    peak: float
    embed_ms: float
    embedding: np.ndarray = field(repr=False)


@dataclass
class EnrollmentSession:
    session_id: str
    member_id: str
    started_at: str
    prompts: list[str]
    current_index: int = 0
    samples: list[CollectedSample] = field(default_factory=list)
    passphrase: Optional[str] = field(default=None, repr=False)

    @property
    def progress(self) -> float:
        return len(self.samples) / max(len(self.prompts), 1)


# ── Audit log (tamper-evident via hash chain) ───────────────────────

def write_enrollment_log(session: EnrollmentSession, reference: np.ndarray) -> Path:
    """Write a non-sensitive audit record of the enrollment session."""
    now = datetime.now(AEST).isoformat()
    entry = {
        "schema": "hman-enrollment-log/v1",
        "ts": now,
        "session_id": session.session_id,
        "member_id": session.member_id,
        "model": "resemblyzer",
        "sample_rate": SAMPLE_RATE,
        "samples_captured": len(session.samples),
        "samples": [
            {
                "index": s.index,
                "prompt": s.prompt,
                "duration_s": round(s.duration_s, 2),
                "rms": round(s.rms, 4),
                "peak": round(s.peak, 3),
                "embed_ms": round(s.embed_ms, 1),
            }
            for s in session.samples
        ],
        "reference_hash_sha256": hashlib.sha256(reference.tobytes()).hexdigest(),
    }
    path = ENROLLMENT_DIR / f"enrollment_{datetime.now(AEST).strftime('%Y%m%d_%H%M%S')}.json"
    path.write_text(json.dumps(entry, indent=2), encoding="utf-8")
    return path


# ── Canonical enrollment prompts ────────────────────────────────────
#
# Ten phonetically diverse sentences spanning English vowels, plosives,
# fricatives, nasals, liquids, and digit pronunciations. No personal
# content — the prompts are identical for every member so the voice
# reference captures your voice, not your biography.

PROMPTS: list[str] = [
    "My subconscious stays here. Local, encrypted, mine alone.",
    "Once I speak, nothing else in the room can activate it.",
    "Three green lights. Two amber. One guarantee: my consent.",
    "The quick brown fox jumps over the lazy dog beside the blue lake.",
    "Seven, fourteen, twenty-one, forty-two, one hundred and nine.",
    "Shadows fall on polished marble as the evening settles in.",
    "If no one asks, I stay silent. If I speak, I am brief.",
    "Thursday, August the eighteenth, nineteen ninety-eight, six-thirty PM.",
    "She writes. She walks. She thinks. She breathes. She answers.",
    "Checking, sending, logged, saved, done. Calm and precise.",
]
