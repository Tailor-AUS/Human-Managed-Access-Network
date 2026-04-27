"""Append-only audit log for connector lifecycle events.

Every step (drafted, surfaced, decided, executed, undone) writes a line
to ``~/.hman/logs/connector_events.jsonl``. The bridge never reads this
file — it's a forensics record consumed offline by ``hman audit`` /
``ops/audit-tail.ps1``.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

_DATA_ENV = os.environ.get("HMAN_DATA_DIR")
_HMAN_DIR = Path(_DATA_ENV).expanduser().resolve() if _DATA_ENV else Path.home() / ".hman"
_LOGS_DIR = _HMAN_DIR / "logs"
_AUDIT_FILE = _LOGS_DIR / "connector_events.jsonl"


def append_event(
    event: str,
    *,
    intention_id: Optional[str] = None,
    connector: Optional[str] = None,
    channel: Optional[str] = None,
    artifact_url: Optional[str] = None,
    member_id: Optional[str] = None,
    extra: Optional[dict[str, Any]] = None,
) -> None:
    """Append a single audit line. Never raises — best-effort only."""
    try:
        _LOGS_DIR.mkdir(parents=True, exist_ok=True)
        record = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "event": event,
        }
        if intention_id is not None:
            record["intention_id"] = intention_id
        if connector is not None:
            record["connector"] = connector
        if channel is not None:
            record["channel"] = channel
        if artifact_url is not None:
            record["artifact_url"] = artifact_url
        if member_id is not None:
            record["member_id"] = member_id
        if extra:
            record["extra"] = extra
        with open(_AUDIT_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
    except Exception:
        # Audit must never block the connector. Swallow.
        pass
