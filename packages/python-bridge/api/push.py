"""APNs push channel for the receptivity gate.

Three endpoints, all mounted by ``server.py``:

- ``POST /api/push/register`` — the iOS app uploads its APNs device
  token after the user grants notification authorization.
- ``POST /api/push/send`` — internal-only. The receptivity gate (issue
  #4) calls this when it resolves an intention's surface channel to
  ``apns``. Looks up the stored device token and ships the push via
  the APNs HTTP/2 endpoint using the ``aioapns`` library.
- ``POST /api/intentions/{id}/decide`` — captures the member's
  Approve / Deny verdict (regardless of which channel surfaced it).
  Records to ``logs/intention_decisions.jsonl`` so the connector that
  owns the intention can pick it up.

Privacy contract:
- Push payloads contain only ``intention_id`` + a short ``summary``
  string (already stripped of PII upstream by the receptivity gate)
  and an expiry. Never the bearer token, never transcripts, never
  vault data — full intention details are fetched on-device after
  the user taps.
- The APNs auth key is read from disk lazily inside ``send_push`` and
  never logged. Path is configurable via ``HMAN_APNS_AUTH_KEY_PATH``.
- The token vault is a JSON file under ``~/.hman/vault/push_tokens.json``
  in dev. Production deployments swap this for Azure Key Vault — see
  ``DEPLOYMENT.md``.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

# Sibling import — server.py does the same dance.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import core  # noqa: E402

router = APIRouter()


# ── Storage ────────────────────────────────────────────────────────
#
# Single JSON file keyed by member_id. Good enough for the local
# bridge's single-user / small-household scope. Replace with a real
# secret-store driver (Azure Key Vault, AWS Secrets Manager) in
# production.

_TOKEN_PATH = Path(os.environ.get(
    "HMAN_PUSH_TOKEN_PATH",
    str(core.HMAN_DIR / "vault" / "push_tokens.json"),
))

_DECISIONS_LOG = Path(os.environ.get(
    "HMAN_INTENTION_LOG_PATH",
    str(core.LOGS_DIR / "intention_decisions.jsonl"),
))


def _read_tokens() -> dict[str, dict]:
    if not _TOKEN_PATH.exists():
        return {}
    try:
        with open(_TOKEN_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        # Corrupt vault → start over rather than crash. The next
        # registration call will repopulate.
        return {}


def _write_tokens(tokens: dict[str, dict]) -> None:
    _TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = _TOKEN_PATH.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(tokens, f, indent=2, sort_keys=True)
    os.replace(tmp, _TOKEN_PATH)


def _append_decision(record: dict) -> None:
    _DECISIONS_LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(_DECISIONS_LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")


# ── Schemas ────────────────────────────────────────────────────────


class PushRegisterRequest(BaseModel):
    device_token: str = Field(..., min_length=1, max_length=256)
    member_id: str = Field(..., min_length=1, max_length=128)


class PushRegisterResponse(BaseModel):
    stored: bool
    member_id: str
    registered_at: str


class PushSendRequest(BaseModel):
    member_id: str
    intention_id: str
    summary: str = Field(..., max_length=180)  # lock-screen safe
    expires_at: str


class PushSendResponse(BaseModel):
    sent: bool
    apns_id: Optional[str] = None
    reason: Optional[str] = None


class IntentionDecisionRequest(BaseModel):
    decision: str  # "approve" | "deny"
    channel: str   # "apns" | "signal" | "voice"


class IntentionDecisionResponse(BaseModel):
    intention_id: str
    decision: str
    channel: str
    recorded_at: str


# ── Endpoints ──────────────────────────────────────────────────────


@router.post("/api/push/register", response_model=PushRegisterResponse)
def push_register(body: PushRegisterRequest) -> PushRegisterResponse:
    """Store ``device_token`` keyed by ``member_id``. Idempotent.

    Auth: the bridge's global bearer-token middleware already gates
    every ``/api/*`` route — see ``server.py``. We don't enforce a
    second factor here because the bearer token *is* the device-level
    secret; an attacker who has it could already impersonate the user
    against any endpoint.
    """
    tokens = _read_tokens()
    now = datetime.now(core.AEST).isoformat()
    tokens[body.member_id] = {
        "device_token": body.device_token,
        "registered_at": now,
    }
    _write_tokens(tokens)
    return PushRegisterResponse(
        stored=True,
        member_id=body.member_id,
        registered_at=now,
    )


@router.post("/api/push/send", response_model=PushSendResponse)
async def push_send(body: PushSendRequest) -> PushSendResponse:
    """Send an APNs push to the registered device.

    Internal-only — the receptivity gate (``packages/core/src/messaging/push.ts``)
    calls this from inside the trust boundary.

    Returns ``sent=False`` with a reason rather than raising on
    "soft" failures (no token registered, APNs key missing, etc.) so
    the gate can fall through to the next channel without dealing
    with HTTP error decoding.
    """
    tokens = _read_tokens()
    record = tokens.get(body.member_id)
    if record is None:
        return PushSendResponse(sent=False, reason="no_token_registered")

    auth_key_path = Path(os.environ.get(
        "HMAN_APNS_AUTH_KEY_PATH",
        str(Path.home() / ".hman" / "secrets" / "apns_auth_key.p8"),
    ))
    if not auth_key_path.exists():
        return PushSendResponse(sent=False, reason="apns_auth_key_missing")

    key_id = os.environ.get("HMAN_APNS_KEY_ID", "")
    team_id = os.environ.get("HMAN_APNS_TEAM_ID", "")
    topic = os.environ.get("HMAN_APNS_BUNDLE_ID", "ai.hman.app")
    if not key_id or not team_id:
        return PushSendResponse(sent=False, reason="apns_creds_incomplete")

    use_sandbox = os.environ.get("HMAN_APNS_SANDBOX", "0") == "1"

    try:
        # Lazy import — `aioapns` is an optional dependency at runtime;
        # the rest of the bridge must keep working without it installed.
        from aioapns import APNs, NotificationRequest, PushType
    except ImportError:
        return PushSendResponse(sent=False, reason="aioapns_not_installed")

    apns = APNs(
        key=str(auth_key_path),
        key_id=key_id,
        team_id=team_id,
        topic=topic,
        use_sandbox=use_sandbox,
    )

    payload = {
        "aps": {
            "alert": {
                "title": "HMAN: Decision needed",
                "body": body.summary,
            },
            "category": "INTENTION_DECISION",
            "sound": "default",
            "mutable-content": 1,
        },
        "intention_id": body.intention_id,
        "summary": body.summary,
        "expires_at": body.expires_at,
    }

    request = NotificationRequest(
        device_token=record["device_token"],
        message=payload,
        push_type=PushType.ALERT,
    )
    response = await apns.send_notification(request)

    if response.is_successful:
        return PushSendResponse(sent=True, apns_id=response.notification_id)
    return PushSendResponse(
        sent=False,
        apns_id=response.notification_id,
        reason=f"apns_status_{response.status}",
    )


@router.post(
    "/api/intentions/{intention_id}/decide",
    response_model=IntentionDecisionResponse,
)
def intention_decide(
    intention_id: str,
    body: IntentionDecisionRequest,
) -> IntentionDecisionResponse:
    """Record the member's verdict on an intention prompt."""
    if body.decision not in {"approve", "deny"}:
        raise HTTPException(status_code=400, detail="decision must be 'approve' or 'deny'")
    if body.channel not in {"apns", "signal", "voice"}:
        raise HTTPException(status_code=400, detail="channel must be 'apns', 'signal', or 'voice'")

    now = datetime.now(core.AEST).isoformat()
    record = {
        "intention_id": intention_id,
        "decision": body.decision,
        "channel": body.channel,
        "recorded_at": now,
    }
    _append_decision(record)
    return IntentionDecisionResponse(**record)
