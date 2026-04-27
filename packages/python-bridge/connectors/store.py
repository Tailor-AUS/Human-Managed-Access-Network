"""Tiny on-disk Intention store.

Drafted intentions can sit for 30+ minutes waiting for a receptive
moment. Holding them in memory means a bridge crash drops them — the
spec says: persist.

Stored at ``~/.hman/connector_intentions/<id>.json``. One file per
intention, atomic write-then-rename. The store is intentionally tiny
(no SQLite dep, no schema migration) — connectors don't need much.
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Optional

from .types import Intention

_DATA_ENV = os.environ.get("HMAN_DATA_DIR")
_HMAN_DIR = Path(_DATA_ENV).expanduser().resolve() if _DATA_ENV else Path.home() / ".hman"
_STORE_DIR = _HMAN_DIR / "connector_intentions"


def _path_for(intention_id: str) -> Path:
    # intention_id is a uuid (we generated it) so it's path-safe; still
    # belt-and-braces strip any path separators just in case.
    safe = intention_id.replace("/", "_").replace("\\", "_")
    return _STORE_DIR / f"{safe}.json"


def save(intention: Intention) -> None:
    _STORE_DIR.mkdir(parents=True, exist_ok=True)
    data = intention.to_dict()
    fd, tmp = tempfile.mkstemp(dir=str(_STORE_DIR), suffix=".json.tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f)
        os.replace(tmp, str(_path_for(intention.id)))
    except Exception:
        try:
            os.unlink(tmp)
        except Exception:
            pass
        raise


def load(intention_id: str) -> Optional[Intention]:
    path = _path_for(intention_id)
    if not path.exists():
        return None
    try:
        return Intention.from_dict(json.loads(path.read_text(encoding="utf-8")))
    except Exception:
        return None


def delete(intention_id: str) -> None:
    path = _path_for(intention_id)
    if path.exists():
        try:
            path.unlink()
        except Exception:
            pass
