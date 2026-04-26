"""Bridge runtime configuration — env vars + optional YAML.

Currently scoped to per-sensor auto-start opt-out, but written so other
boot-time toggles can reuse the same precedence rules:

  1. Environment variables (always win)
  2. ~/.hman/sensors.yaml (or HMAN_DATA_DIR/sensors.yaml)
  3. Default: every available sensor auto-starts

Env-var contract:
  HMAN_SENSOR_AUDIO=on|off
  HMAN_SENSOR_EEG=on|off
  HMAN_SENSOR_KEYSTROKES=on|off
  HMAN_SENSOR_SCREEN=on|off

Truthy values: on, true, yes, 1, enabled
Falsy values:  off, false, no, 0, disabled

YAML shape:
  sensors:
    audio: on
    eeg: off          # disabled until Muse is fixed
    keystrokes: on
    screen: on

The bridge does not crash on a malformed YAML file — it logs and falls
through to defaults so a typo can't take the bridge offline.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

# Re-use the same data dir resolution as core.py so HMAN_DATA_DIR works
# everywhere consistently. Imported lazily to avoid a circular import on
# module load when core.py is still being initialised.
_TRUTHY = {"on", "true", "yes", "1", "enabled", "enable"}
_FALSY = {"off", "false", "no", "0", "disabled", "disable"}


def _data_dir() -> Path:
    env = os.environ.get("HMAN_DATA_DIR")
    if env:
        return Path(env).expanduser().resolve()
    return Path.home() / ".hman"


def _parse_bool(raw: object) -> Optional[bool]:
    """Return True/False for recognised values, None for unrecognised.

    Distinguishing 'unrecognised' from 'False' lets us fall through from
    env to yaml to default cleanly — a stray ``HMAN_SENSOR_AUDIO=banana``
    is treated as "no opinion expressed" rather than silently disabling.
    """
    if isinstance(raw, bool):
        return raw
    if raw is None:
        return None
    s = str(raw).strip().lower()
    if not s:
        return None
    if s in _TRUTHY:
        return True
    if s in _FALSY:
        return False
    return None


def _load_yaml_sensors() -> dict[str, bool]:
    """Read ~/.hman/sensors.yaml if present. Returns {name: enabled}.

    Any parse error or missing file → empty dict. Never raises.
    """
    path = _data_dir() / "sensors.yaml"
    if not path.exists():
        return {}
    try:
        import yaml  # pyyaml is already a runtime dep
    except Exception as e:
        print(f"[config] sensors.yaml found but pyyaml not importable: {e}")
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
    except Exception as e:
        print(f"[config] failed to parse {path}: {e} — using defaults")
        return {}

    sensors_section = data.get("sensors") if isinstance(data, dict) else None
    if not isinstance(sensors_section, dict):
        return {}

    out: dict[str, bool] = {}
    for name, value in sensors_section.items():
        parsed = _parse_bool(value)
        if parsed is not None:
            out[str(name).lower()] = parsed
    return out


def sensor_autostart_enabled(name: str) -> bool:
    """Should this sensor auto-start on boot?

    Precedence: env > yaml > default(True). Returning True does NOT mean
    the sensor will actually start — the caller still has to check
    ``sensor.available()``. This function only encodes member intent.
    """
    env_key = f"HMAN_SENSOR_{name.upper()}"
    env_val = _parse_bool(os.environ.get(env_key))
    if env_val is not None:
        return env_val

    yaml_cfg = _load_yaml_sensors()
    if name.lower() in yaml_cfg:
        return yaml_cfg[name.lower()]

    return True


def sensor_autostart_source(name: str) -> str:
    """Where the auto-start decision came from. Useful for boot logs.

    Returns one of: 'env', 'yaml', 'default'.
    """
    if _parse_bool(os.environ.get(f"HMAN_SENSOR_{name.upper()}")) is not None:
        return "env"
    if name.lower() in _load_yaml_sensors():
        return "yaml"
    return "default"
