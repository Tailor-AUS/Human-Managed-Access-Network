"""Sensor registry — single source of truth for the bridge API.

Every sensor in this package gets auto-registered below. The server's
/api/sensors/* routes iterate this dict.

Order here is the display order in the dashboard.
"""
from __future__ import annotations

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
