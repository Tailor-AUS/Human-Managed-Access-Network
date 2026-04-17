"""
.HMAN — Voice Enrollment (Phase A, Gate 5 foundation)

Records a phonetically diverse set of utterances from the member,
computes a voice embedding (resemblyzer, 256-dim), averages across samples,
and saves encrypted at rest.

Output: hman/identity/voice_embedding.enc
        hman/enrollment/enrollment_log.json  (audit record of this session)

Usage:
    python enroll_voice.py                  # interactive enrollment
    python enroll_voice.py --device 1       # specify mic device index
    python enroll_voice.py --passphrase X   # non-interactive (NOT for real use)
"""
from __future__ import annotations

import argparse
import base64
import getpass
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import numpy as np
import sounddevice as sd
import soundfile as sf
import torch
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# Data directory: env override, otherwise ~/.hman
_data_env = os.environ.get("HMAN_DATA_DIR")
HMAN_DIR = Path(_data_env).expanduser().resolve() if _data_env else (
    Path.home() / ".hman"
)
IDENTITY_DIR = HMAN_DIR / "identity"
LOG_DIR = HMAN_DIR / "enrollment"

HMAN_DIR.mkdir(parents=True, exist_ok=True)
IDENTITY_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)

AEST = timezone(timedelta(hours=10))
SAMPLE_RATE = 16000
MIN_DURATION = 2.0         # seconds — any sample under this is rejected
MAX_DURATION = 12.0
RMS_MIN = 0.01             # below this = silence / not speaking
RMS_MAX = 0.40             # above this = clipping
PBKDF2_ITERATIONS = 600_000

# Phonetically diverse enrollment prompts — covers all English vowels,
# plosives, fricatives, sibilants, nasals, liquids, diphthongs.
# Includes Knox's vocabulary: sovereign, Tailor, Gemma, Bridget, Goldie, Primmie.
PROMPTS = [
    "Sovereign AI runs locally on my hardware, not someone else's cloud.",
    "Bridget and the kids — Winston, Goldie, and Primmie — mean everything.",
    "Tailor accelerates consensus. Bank handles flows. HMAN gates everything.",
    "Gemma four runs on the four-ninety. Llama three point two handles the quick calls.",
    "If the oil crisis is not a wake-up call for onshoring, politicians need to move.",
    "Project Wattle is a twenty-two nanometre inference chip. Global Foundries. RISC-V.",
    "The five gates: light bulb, member control, extension, reactive, voice-bound.",
    "Seventy-five, six thousand and thirty-two. Eighteenth of April, Saturday.",
    "She walks. She runs. She thinks. She writes. She draws. She dances.",
    "Checking, sending, logged, saved, done. Drafting with clipboard.",
]


def _prompt_passphrase(confirm: bool = True) -> str:
    """Get a passphrase from the member, confirming if needed."""
    pw = getpass.getpass("Choose a passphrase for your voice identity: ")
    if not pw or len(pw) < 8:
        print("  Passphrase must be at least 8 characters.")
        sys.exit(1)
    if confirm:
        pw2 = getpass.getpass("Confirm passphrase: ")
        if pw != pw2:
            print("  Passphrases did not match.")
            sys.exit(1)
    return pw


def _derive_key(passphrase: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    return base64.urlsafe_b64encode(kdf.derive(passphrase.encode("utf-8")))


def _encrypt_and_save(embedding: np.ndarray, passphrase: str, meta: dict) -> Path:
    salt = os.urandom(16)
    key = _derive_key(passphrase, salt)
    f = Fernet(key)
    payload = {
        "schema": "hman-voice-identity/v1",
        "member_id": meta.get("member_id"),
        "model": meta.get("model"),
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

    target = IDENTITY_DIR / "voice_embedding.enc"
    target.write_text(json.dumps(envelope, indent=2), encoding="utf-8")
    # Restrict perms on POSIX; best-effort on Windows
    try:
        os.chmod(target, 0o600)
    except Exception:
        pass
    return target


def _record(duration_hint: float, device: int | None) -> np.ndarray | None:
    """Record until the user presses Enter to stop (or max duration)."""
    print(f"  Speak now. Press Enter when done (or wait {duration_hint:.0f}s max)...")
    # Use a callback-based stream we can interrupt
    import threading
    buf = []
    stop = threading.Event()

    def cb(indata, frames, t_info, status):
        if status:
            print(f"  (audio status: {status})")
        buf.append(indata.copy())

    with sd.InputStream(
        samplerate=SAMPLE_RATE, channels=1, dtype="float32",
        blocksize=int(SAMPLE_RATE * 0.05), device=device, callback=cb,
    ):
        t0 = time.time()
        input_thread = threading.Thread(target=lambda: (input(), stop.set()), daemon=True)
        input_thread.start()
        while not stop.is_set() and (time.time() - t0) < duration_hint:
            time.sleep(0.1)
    if not buf:
        return None
    audio = np.concatenate(buf, axis=0).flatten()
    return audio


def _audit_sample(audio: np.ndarray) -> tuple[bool, str]:
    """Check a recorded sample is usable. Returns (ok, reason)."""
    dur = len(audio) / SAMPLE_RATE
    if dur < MIN_DURATION:
        return False, f"too short ({dur:.1f}s < {MIN_DURATION}s)"
    if dur > MAX_DURATION:
        # truncate rather than reject
        audio = audio[: int(MAX_DURATION * SAMPLE_RATE)]
    rms = float(np.sqrt(np.mean(audio ** 2)))
    if rms < RMS_MIN:
        return False, f"too quiet (RMS {rms:.4f})"
    if rms > RMS_MAX:
        return False, f"clipping (RMS {rms:.4f})"
    peak = float(np.max(np.abs(audio)))
    if peak > 0.98:
        return False, f"peaks clipped ({peak:.3f})"
    return True, f"ok (dur={dur:.1f}s, rms={rms:.3f}, peak={peak:.2f})"


def _pick_mic(device: int | None) -> int:
    if device is not None:
        return device
    # Prefer Yealink headset, then WO Mic, then default input
    devices = sd.query_devices()
    for i, d in enumerate(devices):
        if d["max_input_channels"] > 0:
            name = d["name"].lower()
            if "yealink" in name:
                return i
    for i, d in enumerate(devices):
        if d["max_input_channels"] > 0:
            if "wo mic" in d["name"].lower():
                return i
    return sd.default.device[0]


def main():
    parser = argparse.ArgumentParser(description=".HMAN voice enrollment")
    parser.add_argument("--device", type=int, default=None, help="audio input device index")
    parser.add_argument("--member-id", default="knox-hart", help="member identifier")
    parser.add_argument("--model", default="resemblyzer", choices=["resemblyzer"])
    parser.add_argument("--passphrase", default=None, help="non-interactive passphrase (DEV ONLY)")
    args = parser.parse_args()

    print()
    print("  .HMAN voice enrollment — Gate 5 foundation")
    print("  ───────────────────────────────────────────")
    print(f"  Member:        {args.member_id}")
    print(f"  Model:         {args.model}")
    print(f"  Output:        {IDENTITY_DIR / 'voice_embedding.enc'}")
    print(f"  Sample rate:   {SAMPLE_RATE} Hz mono")
    print()

    if (IDENTITY_DIR / "voice_embedding.enc").exists():
        print("  ⚠  An enrolled embedding already exists. Re-enrolling will replace it.")
        ans = input("  Continue? [y/N] ").strip().lower()
        if ans != "y":
            print("  Aborted.")
            return

    device = _pick_mic(args.device)
    dev_info = sd.query_devices(device)
    print(f"  Mic device:    [{device}] {dev_info['name']}")
    print()

    # Passphrase
    if args.passphrase:
        passphrase = args.passphrase
        print("  (using --passphrase from CLI; not recommended for real enrollment)")
    else:
        passphrase = _prompt_passphrase()
    print()

    # Load model
    print("  Loading voice encoder...")
    from resemblyzer import VoiceEncoder, preprocess_wav
    enc_device = "cuda" if torch.cuda.is_available() else "cpu"
    encoder = VoiceEncoder(device=enc_device, verbose=False)
    print(f"  Loaded on {enc_device}.")
    print()

    # Record prompts
    samples: list[dict] = []
    prompts = list(PROMPTS)
    idx = 0
    while idx < len(prompts):
        prompt = prompts[idx]
        print(f"  [{idx+1}/{len(prompts)}]  \"{prompt}\"")
        audio = _record(duration_hint=max(6.0, len(prompt) * 0.1), device=device)
        if audio is None:
            print("  No audio captured. Retry.")
            continue
        ok, reason = _audit_sample(audio)
        print(f"      {reason}")
        if not ok:
            ans = input("      Retry? [Y/n] ").strip().lower()
            if ans == "n":
                idx += 1
            continue
        # Preprocess (16kHz, normalised, VAD-trimmed) and embed
        wav = preprocess_wav(audio, source_sr=SAMPLE_RATE)
        t0 = time.time()
        emb = encoder.embed_utterance(wav)
        embed_ms = (time.time() - t0) * 1000
        samples.append({
            "prompt": prompt,
            "duration_s": round(len(audio) / SAMPLE_RATE, 2),
            "rms": round(float(np.sqrt(np.mean(audio ** 2))), 4),
            "peak": round(float(np.max(np.abs(audio))), 3),
            "embedding": emb,
            "embed_ms": round(embed_ms, 1),
        })
        idx += 1
        print()

    if len(samples) < 3:
        print("  Not enough samples captured. Aborting.")
        return

    # Average embeddings
    embeddings = np.stack([s["embedding"] for s in samples])
    reference = embeddings.mean(axis=0)
    reference = reference / np.linalg.norm(reference)

    # Internal consistency: cosine similarity of each sample vs reference
    sims = [float(np.dot(e / np.linalg.norm(e), reference)) for e in embeddings]
    print(f"  Enrolled {len(samples)} samples.")
    print(f"  Self-consistency (cosine sim to reference):")
    for s, sim in zip(samples, sims):
        print(f"    {sim:.3f}  {s['prompt'][:50]}")
    print(f"  min={min(sims):.3f}  mean={sum(sims)/len(sims):.3f}  max={max(sims):.3f}")
    print()

    # Drop any outlier samples (cosine < 0.80) and recompute
    kept = [i for i, sim in enumerate(sims) if sim >= 0.80]
    if len(kept) < len(samples):
        dropped = len(samples) - len(kept)
        print(f"  Dropping {dropped} outlier samples (sim < 0.80). Re-averaging.")
        reference = embeddings[kept].mean(axis=0)
        reference = reference / np.linalg.norm(reference)
        samples = [samples[i] for i in kept]

    # Save encrypted
    now = datetime.now(AEST).isoformat()
    target = _encrypt_and_save(
        reference,
        passphrase,
        {
            "member_id": args.member_id,
            "model": args.model,
            "created_at": now,
            "samples_used": len(samples),
        },
    )
    print(f"  Encrypted reference saved: {target}")

    # Audit log
    log_entry = {
        "schema": "hman-enrollment-log/v1",
        "ts": now,
        "member_id": args.member_id,
        "model": args.model,
        "device": dev_info["name"],
        "sample_rate": SAMPLE_RATE,
        "samples_captured": len(samples),
        "samples": [
            {
                "prompt": s["prompt"],
                "duration_s": s["duration_s"],
                "rms": s["rms"],
                "peak": s["peak"],
                "embed_ms": s["embed_ms"],
            }
            for s in samples
        ],
        "self_consistency": {
            "min": round(min(sims), 3),
            "mean": round(sum(sims) / len(sims), 3),
            "max": round(max(sims), 3),
        },
        "reference_hash_sha256": hashlib.sha256(reference.tobytes()).hexdigest(),
    }
    log_path = LOG_DIR / f"enrollment_{datetime.now(AEST).strftime('%Y%m%d_%H%M%S')}.json"
    log_path.write_text(json.dumps(log_entry, indent=2), encoding="utf-8")
    print(f"  Audit log saved:            {log_path}")
    print()
    print("  ✓ Enrollment complete. Gate 5 reference ready for Phase B.")


if __name__ == "__main__":
    main()
