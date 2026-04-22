"""Ambient audio sensor — always-on mic capture + Whisper transcription.

Single sounddevice InputStream feeds both live-RMS (for the pulse trace)
and 30-second chunks (for Whisper transcription).
"""
from __future__ import annotations

import math
import queue
import threading
import time
from collections import deque
from typing import Optional

import numpy as np

from .base import Sensor

SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK_SECONDS = 30
SILENCE_THRESHOLD = 0.002
CALLBACK_BLOCKSIZE = 1024  # ~64ms at 16kHz


class AudioSensor(Sensor):
    name = "audio"

    def __init__(self, device: Optional[int] = None) -> None:
        super().__init__()
        self.device = device
        self._whisper_model = None
        self.chunks_silent = 0
        self.last_transcript = ""
        self._current_rms = 0.0
        self._peak_rms_60s = 0.0
        self._peak_decay_thread: Optional[threading.Thread] = None

    def available(self) -> bool:
        try:
            import sounddevice as sd
            devs = [d for d in sd.query_devices() if d.get("max_input_channels", 0) > 0]
            return len(devs) > 0
        except Exception:
            return False

    def pulse(self) -> float:
        # Map RMS (typically 0.001–0.3 for speech) to 0..1 via log scale.
        # RMS = 0 → 0. RMS = 0.3 → ~1.0. Quiet room ~0.002 → ~0.15.
        r = max(self._current_rms, 1e-5)
        # 20*log10(r) is dBFS, -40 to 0 for real signal. Normalise:
        db = 20.0 * math.log10(r)  # -100..0
        return max(0.0, min(1.0, (db + 60) / 60))

    def summary(self) -> dict:
        return {
            "chunks_captured": self.entries_written,
            "chunks_silent": self.chunks_silent,
            "last_transcript": self.last_transcript,
            "current_rms": round(self._current_rms, 4),
            "peak_rms_60s": round(self._peak_rms_60s, 4),
            "current_db": round(20 * math.log10(max(self._current_rms, 1e-5)), 1),
        }

    def _loop(self) -> None:
        import sounddevice as sd

        # Thread-safe handoff from callback → main loop
        buffer_q: queue.Queue[np.ndarray] = queue.Queue()

        def callback(indata, frames, time_info, status):
            # indata is float32 (frames, channels); mono so flatten
            samples = indata[:, 0].astype(np.float32)
            rms = float(np.sqrt(np.mean(samples ** 2)))
            self._current_rms = rms
            if rms > self._peak_rms_60s:
                self._peak_rms_60s = rms
            buffer_q.put(samples.copy())

        # Peak decay — halves the peak every 30s so it reflects "recent" loudness
        def decay():
            while self.running:
                time.sleep(5)
                self._peak_rms_60s *= 0.8

        self._peak_decay_thread = threading.Thread(target=decay, daemon=True)
        self._peak_decay_thread.start()

        try:
            with sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=CHANNELS,
                dtype="float32",
                blocksize=CALLBACK_BLOCKSIZE,
                device=self.device,
                callback=callback,
            ):
                chunk_target = CHUNK_SECONDS * SAMPLE_RATE
                chunk_samples: list[np.ndarray] = []
                chunk_count = 0

                while self.running:
                    try:
                        block = buffer_q.get(timeout=0.5)
                    except queue.Empty:
                        continue
                    chunk_samples.append(block)
                    chunk_count += len(block)

                    if chunk_count >= chunk_target:
                        audio = np.concatenate(chunk_samples)[:chunk_target]
                        chunk_samples = []
                        chunk_count = 0

                        rms = float(np.sqrt(np.mean(audio ** 2)))
                        if rms < SILENCE_THRESHOLD:
                            self.chunks_silent += 1
                            continue

                        try:
                            text = self._transcribe(audio)
                        except Exception as e:
                            self.last_error = f"transcribe failed: {type(e).__name__}: {e}"
                            continue
                        if not text:
                            continue
                        self.last_transcript = text
                        self._append({
                            "text": text,
                            "rms": round(rms, 4),
                            "duration_s": CHUNK_SECONDS,
                        })
        except Exception as e:
            self.last_error = f"{type(e).__name__}: {e}"

        # On stop, reset live values so UI goes quiet
        self._current_rms = 0.0
        self._peak_rms_60s = 0.0

    def _transcribe(self, audio: np.ndarray) -> str:
        # faster-whisper (CTranslate2) — no torch dependency, 3-4x faster on CPU
        # than openai-whisper, and dodges the c10.dll load failure on this box.
        if self._whisper_model is None:
            from faster_whisper import WhisperModel
            self._whisper_model = WhisperModel(
                "base", device="cpu", compute_type="int8",
            )
        segments, _info = self._whisper_model.transcribe(
            audio, language="en", beam_size=1,
        )
        return " ".join(seg.text for seg in segments).strip()
