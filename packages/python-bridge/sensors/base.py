"""Shared base for every sensor in .HMAN.

Every sensor follows the same shape:
  - subclass Sensor
  - implement _loop() (called in a background daemon thread)
  - call _append({...}) to write a row to the daily JSONL log
  - implement available() if the sensor has hardware/OS preconditions
  - override summary() to give the UI a one-glance metric

API surface the server consumes:
  available()  -> bool
  running      -> bool
  start()      -> None
  stop()       -> None
  status()     -> dict (running, started_at, last_ts, last_error, summary)
  recent(seconds=N) -> list[dict]

The log path for a sensor named "audio" on 2026-04-19 is
  ~/.hman/memory/audio_2026-04-19.jsonl
"""
from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

MEMORY_DIR = Path.home() / ".hman" / "memory"
MEMORY_DIR.mkdir(parents=True, exist_ok=True)


def log_path(name: str, dt: Optional[datetime] = None) -> Path:
    dt = dt or datetime.now(timezone.utc)
    return MEMORY_DIR / f"{name}_{dt.strftime('%Y-%m-%d')}.jsonl"


class Sensor:
    name: str = "base"

    def __init__(self) -> None:
        self.running = False
        self.started_at: Optional[str] = None
        self.last_ts: Optional[str] = None
        self.last_error: Optional[str] = None
        self.entries_written = 0
        self._thread: Optional[threading.Thread] = None

    # Override — True if the hardware/OS preconditions for this sensor are met
    def available(self) -> bool:
        return True

    # Override — small dict the dashboard can show without hitting /recent
    def summary(self) -> dict[str, Any]:
        return {"entries_written": self.entries_written}

    # Override — instantaneous activity level, 0..1. The dashboard
    # scrolls this value into a sparkline to prove "the sensor is alive".
    def pulse(self) -> float:
        return 0.0

    def start(self) -> None:
        if self.running or not self.available():
            return
        self.running = True
        self.started_at = datetime.now(timezone.utc).isoformat()
        self._thread = threading.Thread(target=self._safe_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self.running = False

    def status(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "available": self.available(),
            "running": self.running,
            "started_at": self.started_at,
            "last_ts": self.last_ts,
            "last_error": self.last_error,
            "summary": self.summary(),
            "pulse": self.pulse() if self.running else 0.0,
        }

    def recent(self, seconds: int = 3600) -> list[dict]:
        now = datetime.now(timezone.utc)
        cutoff = now.timestamp() - seconds
        # Read today + yesterday to cover recent windows that cross midnight UTC
        files = [log_path(self.name, now), log_path(self.name)]
        seen = set()
        out: list[dict] = []
        for path in files:
            if path in seen or not path.exists():
                continue
            seen.add(path)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        try:
                            entry = json.loads(line)
                            ts = datetime.fromisoformat(entry["ts"]).timestamp()
                            if ts >= cutoff:
                                out.append(entry)
                        except Exception:
                            continue
            except FileNotFoundError:
                continue
        out.sort(key=lambda e: e.get("ts", ""), reverse=True)
        return out

    def _safe_loop(self) -> None:
        try:
            self._loop()
        except Exception as e:
            self.last_error = f"{type(e).__name__}: {e}"
            self.running = False

    # Override
    def _loop(self) -> None:
        raise NotImplementedError

    def _append(self, entry: dict) -> None:
        entry = {"ts": datetime.now(timezone.utc).isoformat(), **entry}
        self.last_ts = entry["ts"]
        try:
            with open(log_path(self.name), "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
            self.entries_written += 1
        except Exception as e:
            self.last_error = f"log write failed: {e}"
