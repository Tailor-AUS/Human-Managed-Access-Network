"""EEG sensor — Muse S Athena via Bluetooth LE.

Placeholder. Real streaming lives in muse-brain/stream_v2.py and needs
bleak + the Muse GATT handshake. Bringing that in means an async event
loop in a thread + reliable BLE reconnection logic. Defer until after
the IA/UI refactor is live and the easy sensors are verified.

For now: available() returns True only if bleak is importable AND we
find a Muse device on scan. Start is a no-op that surfaces "not
implemented" in last_error.
"""
from __future__ import annotations

from typing import Any

from .base import Sensor


class EEGSensor(Sensor):
    name = "eeg"

    def __init__(self) -> None:
        super().__init__()
        self._available_cache: bool | None = None

    def available(self) -> bool:
        # Non-blocking cheap check: just confirm bleak is installed. A true
        # "Muse detected" probe needs an async BLE scan which we can't do
        # synchronously from the API handler — we'd block the event loop.
        if self._available_cache is not None:
            return self._available_cache
        try:
            import bleak  # noqa: F401
            self._available_cache = True
        except Exception:
            self._available_cache = False
        return self._available_cache

    def summary(self) -> dict[str, Any]:
        return {
            "connected": False,
            "device": "Muse S Athena",
            "note": "streaming not yet wired — start() is a no-op",
        }

    def _loop(self) -> None:
        # No-op until the bleak streamer is ported over.
        self.last_error = "EEG streamer not yet implemented — port from muse-brain/stream_v2.py"
        self.running = False

    def start(self) -> None:
        # Don't spawn a thread; just mark the error and stay idle.
        self.last_error = "EEG streamer not yet implemented"
