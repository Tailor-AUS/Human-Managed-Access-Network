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
  - Short-lived pairing codes for QR-based phone enrolment
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
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


# ── Pairing codes (in-memory, short-lived) ──────────────────────────
#
# Used by /api/pair/begin and /api/pair/redeem to onboard a phone via
# QR code. The desktop generates a 6-character code + URL, displays it
# as a QR; the phone scans, the SWA hits redeem, the phone gets the
# bearer token. State is held in process memory only — process restart
# correctly invalidates outstanding codes (no persistent record on disk).
#
# Security ceiling:
#   - 60 second TTL
#   - Single-use redemption (`redeemed` flag flips on first call)
#   - Max 3 redeem attempts per code; further attempts kill the code
#   - Codes use a confusable-free alphabet (no I/O/0/1)

PAIRING_TTL_SECONDS = 60
PAIRING_CODE_LENGTH = 6
PAIRING_MAX_REDEEM_ATTEMPTS = 3
PAIRING_BEGIN_RATE_WINDOW = 60.0   # seconds
PAIRING_BEGIN_RATE_MAX = 10        # per IP per window

# Confusable-free: A-Z2-9 minus IO01
_PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


@dataclass
class PairingCode:
    code: str
    token: str           # the bearer token to hand back on redeem
    created_at: float    # unix ts (monotonic-equivalent enough at TTL=60s)
    expires_at: float
    attempts: int = 0    # increments on each redeem call
    redeemed: bool = False


# code → PairingCode. Only living entries; expired ones get evicted lazily.
_pairing_codes: dict[str, PairingCode] = {}
_pairing_lock = threading.Lock()

# IP → list[float] of begin-call timestamps within the current window.
_pairing_begin_history: dict[str, list[float]] = {}


def _generate_pairing_code() -> str:
    """6-char code from the confusable-free alphabet."""
    return "".join(secrets.choice(_PAIRING_ALPHABET) for _ in range(PAIRING_CODE_LENGTH))


def _evict_expired_codes(now: Optional[float] = None) -> None:
    """Remove codes past TTL. Called opportunistically on begin/redeem."""
    now = time.time() if now is None else now
    expired = [c for c, p in _pairing_codes.items() if p.expires_at <= now]
    for c in expired:
        _pairing_codes.pop(c, None)


def begin_pairing(token: str, base_url: str, remote_ip: str) -> tuple[PairingCode, str]:
    """Mint a new pairing code. Returns (PairingCode, redeem_url).

    Raises ValueError if rate-limit hit. The bearer `token` is the value
    the phone will receive on redeem — pass the bridge's HMAN_AUTH_TOKEN.
    `base_url` is the public origin the phone will hit (e.g. the SWA URL).

    On collision (vanishingly unlikely), regenerates the code.
    """
    now = time.time()
    with _pairing_lock:
        # Rate-limit per remote IP
        history = [t for t in _pairing_begin_history.get(remote_ip, []) if now - t < PAIRING_BEGIN_RATE_WINDOW]
        if len(history) >= PAIRING_BEGIN_RATE_MAX:
            _pairing_begin_history[remote_ip] = history
            raise ValueError("rate limit exceeded")
        history.append(now)
        _pairing_begin_history[remote_ip] = history

        _evict_expired_codes(now)

        # Generate a fresh code. Retry on collision (extremely unlikely; ~32^6 = 1 in 1B).
        for _ in range(8):
            code = _generate_pairing_code()
            if code not in _pairing_codes:
                break
        else:
            raise ValueError("could not allocate code")

        entry = PairingCode(
            code=code,
            token=token,
            created_at=now,
            expires_at=now + PAIRING_TTL_SECONDS,
        )
        _pairing_codes[code] = entry

    # base_url should be a bare origin (e.g. https://hman.example.com).
    redeem_url = f"{base_url.rstrip('/')}/redeem?code={code}"
    return entry, redeem_url


class PairingError(Exception):
    """Raised by redeem_pairing when the code can't be redeemed."""

    def __init__(self, status: int, reason: str):
        super().__init__(reason)
        self.status = status
        self.reason = reason


def redeem_pairing(code: str) -> str:
    """Single-use redemption. Returns the bearer token on success.

    Raises PairingError(status=401|410, reason=...) on every failure mode.
    Increments attempt counter; deletes the code after PAIRING_MAX_REDEEM_ATTEMPTS
    failures or on first successful redeem.
    """
    code = (code or "").strip().upper()
    if not code or len(code) != PAIRING_CODE_LENGTH:
        raise PairingError(401, "invalid code format")

    now = time.time()
    with _pairing_lock:
        _evict_expired_codes(now)
        entry = _pairing_codes.get(code)
        if entry is None:
            raise PairingError(401, "unknown or expired code")
        if entry.expires_at <= now:
            _pairing_codes.pop(code, None)
            raise PairingError(410, "code expired")
        if entry.redeemed:
            _pairing_codes.pop(code, None)
            raise PairingError(410, "code already redeemed")

        entry.attempts += 1
        if entry.attempts > PAIRING_MAX_REDEEM_ATTEMPTS:
            _pairing_codes.pop(code, None)
            raise PairingError(410, "too many attempts")

        entry.redeemed = True
        token = entry.token
        # Single-use: drop immediately after handing back the token.
        _pairing_codes.pop(code, None)
        return token


def pairing_state_snapshot() -> dict:
    """Diagnostic view (for tests / debugging only — never expose over auth-exempt route)."""
    with _pairing_lock:
        return {
            "active": len(_pairing_codes),
            "ttl_seconds": PAIRING_TTL_SECONDS,
        }
