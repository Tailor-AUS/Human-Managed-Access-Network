"""Sensor registry — single source of truth for the bridge API.

Every sensor in this package gets auto-registered below. The server's
/api/sensors/* routes iterate this dict.

Order here is the display order in the dashboard.
"""
from __future__ import annotations

import sys
import traceback
from pathlib import Path

from .audio import AudioSensor
from .keystrokes import KeystrokesSensor
from .screen import ScreenSensor
from .eeg import EEGSensor

# Singleton instances — one per sensor per bridge process
_SENSORS: dict[str, object] = {}


def _ensure() -> dict[str, object]:
    if not _SENSORS:
        _SENSORS["audio"] = AudioSensor()
        _SENSORS["keystrokes"] = KeystrokesSensor()
        _SENSORS["screen"] = ScreenSensor()
        _SENSORS["eeg"] = EEGSensor()
    return _SENSORS


def get(name: str):
    s = _ensure().get(name)
    return s


def all_sensors():
    return list(_ensure().values())


def names() -> list[str]:
    return list(_ensure().keys())


def autostart_all() -> list[dict]:
    """Auto-start every sensor that's available *and* enabled by config.

    Logs one line per sensor in the same shape the issue asks for:
      [sensor:audio] auto-started
      [sensor:eeg]   auto-start disabled by config
      [sensor:eeg]   not available (bleak missing)
      [sensor:audio] failed to start: <error>

    Failures NEVER propagate — if a sensor's start() throws, we capture
    the message in last_error and keep going. The bridge process must
    not crash because one sensor misbehaved.

    Returns the list of post-start status dicts so callers can log/test.
    """
    # Lazy import — avoids any chance of circular import via core/server.
    # config.py lives one directory up; we add the parent (the python-bridge
    # root) to sys.path for the same reason api/server.py does.
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    import config as _config  # noqa: E402

    results: list[dict] = []
    for sensor in all_sensors():
        name = sensor.name
        enabled = _config.sensor_autostart_enabled(name)
        source = _config.sensor_autostart_source(name)

        if not enabled:
            print(f"[sensor:{name}] auto-start disabled by config ({source})")
            results.append(sensor.status())
            continue

        try:
            available = sensor.available()
        except Exception as e:
            sensor.last_error = f"available() raised: {type(e).__name__}: {e}"
            print(f"[sensor:{name}] availability check failed: {e}")
            results.append(sensor.status())
            continue

        if not available:
            # Not an error — just nothing to start (e.g. EEG with no Muse,
            # keystrokes/screen on non-Windows). Surface in last_error so
            # the dashboard explains why it's idle.
            sensor.last_error = "hardware/OS preconditions not met (available=False)"
            print(f"[sensor:{name}] not available, skipping auto-start")
            results.append(sensor.status())
            continue

        try:
            sensor.start()
        except Exception as e:
            # Never let a single sensor crash the bridge. _safe_loop
            # already swallows in-thread errors; this catches synchronous
            # failures inside start() itself (e.g. thread spawn errors).
            sensor.last_error = f"auto-start failed: {type(e).__name__}: {e}"
            print(f"[sensor:{name}] failed to start: {e}")
            traceback.print_exc()
            results.append(sensor.status())
            continue

        if sensor.running:
            print(f"[sensor:{name}] auto-started")
        else:
            # start() returns silently if already running or unavailable;
            # if we get here with running=False something quietly refused.
            print(f"[sensor:{name}] start() returned but sensor not running")

        results.append(sensor.status())

    return results
