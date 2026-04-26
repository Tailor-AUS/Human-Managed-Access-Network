"""HTTP endpoints for the connector subsystem.

Surface:
  - ``POST /api/connectors/github/draft``
        body: ``{"context": "..."}``
        returns: an Intention (camelCase JSON) — also persisted to disk
        keyed by ``id``.

  - ``POST /api/connectors/github/execute``
        body: ``{"intentionId": "...", "channel": "voice"|"text"}``
        Re-verifies Gate 5, signs a PACT attestation, calls the
        connector's ``execute``, appends to the audit log, and removes
        the intention from the on-disk store.

  - ``GET /api/connectors/github/intentions``
        Lists drafted-but-not-yet-executed intentions (for the dashboard
        queue page).

  - ``DELETE /api/connectors/github/intentions/{id}``
        Drop a draft without executing it. Logged as ``decided`` with
        ``decision="drop"``.

Both the draft and execute endpoints depend on Gate 5 being armed —
the same biometric check ``/api/gate5/verify`` enforces. The execute
endpoint does *not* take fresh audio (the consent moment is short and
audio capture happens client-side); instead the caller must have
verified Gate 5 within the last ``GATE5_FRESHNESS_SECONDS`` seconds.
The bridge tracks the most recent activation in its in-memory state
and rejects requests when the last accept is too old.
"""
from __future__ import annotations

from typing import Callable, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from connectors import (
    GitHubConnector,
    append_event,
    sign_attestation,
)
from connectors import store as intention_store


router = APIRouter(prefix="/api/connectors/github", tags=["connectors"])


# ── Pydantic wire shapes ────────────────────────────────────────────


class DraftIn(BaseModel):
    context: str
    member_id: Optional[str] = None


class IntentionOut(BaseModel):
    id: str
    connector: str
    action: str
    payload: dict
    description: str
    urgency: float
    context: Optional[str] = None
    draftedAt: str


class ExecuteIn(BaseModel):
    intentionId: str
    channel: str  # "voice" | "text"
    member_id: str = "member"


class ExecutionResultOut(BaseModel):
    success: bool
    artifactUrl: Optional[str] = None
    artifactId: Optional[str] = None
    attestation: dict
    error: Optional[str] = None


class IntentionListOut(BaseModel):
    intentions: list[IntentionOut]


# ── Shared connector instance ───────────────────────────────────────
#
# Lazily constructed so import-time env reads don't fail in tests.

_connector: Optional[GitHubConnector] = None


def get_connector() -> GitHubConnector:
    global _connector
    if _connector is None:
        _connector = GitHubConnector()
    return _connector


# ── Gate 5 freshness check ──────────────────────────────────────────
#
# The consent moment must be backed by a *recent* Gate-5 verify event.
# The dependency is wired by ``server.py`` at mount time so this module
# can be imported without server-state coupling.

GATE5_FRESHNESS_SECONDS = 60

_gate5_check: Optional[Callable[[], tuple[bool, str]]] = None


def configure_gate5_check(check: Callable[[], tuple[bool, str]]) -> None:
    """Register the Gate-5 freshness check. Returns ``(ok, reason)``.

    ``ok`` is True iff Gate 5 is armed AND ``last_activation`` is within
    GATE5_FRESHNESS_SECONDS. The reason string surfaces in the 401 body.
    """
    global _gate5_check
    _gate5_check = check


def _require_fresh_gate5() -> None:
    if _gate5_check is None:
        # Bridge wasn't wired — fail closed.
        raise HTTPException(status_code=503, detail="Gate 5 freshness check not configured")
    ok, reason = _gate5_check()
    if not ok:
        raise HTTPException(status_code=401, detail=f"Gate 5 not fresh: {reason}")


# ── Endpoints ───────────────────────────────────────────────────────


@router.post("/draft", response_model=IntentionOut)
def draft(body: DraftIn) -> IntentionOut:
    _require_fresh_gate5()
    connector = get_connector()
    intention = connector.draft(context=body.context, member_id=body.member_id)
    intention_store.save(intention)
    append_event(
        "drafted",
        intention_id=intention.id,
        connector=intention.connector,
        member_id=body.member_id,
        extra={"description": intention.description, "urgency": intention.urgency},
    )
    d = intention.to_dict()
    return IntentionOut(**d)


@router.post("/execute", response_model=ExecutionResultOut)
def execute(body: ExecuteIn) -> ExecutionResultOut:
    _require_fresh_gate5()
    if body.channel not in ("voice", "text"):
        raise HTTPException(status_code=400, detail=f"invalid channel: {body.channel}")

    intention = intention_store.load(body.intentionId)
    if intention is None:
        raise HTTPException(status_code=404, detail=f"intention {body.intentionId} not found")

    attestation = sign_attestation(
        intention=intention,
        member_id=body.member_id,
        channel=body.channel,
    )
    append_event(
        "decided",
        intention_id=intention.id,
        connector=intention.connector,
        channel=body.channel,
        member_id=body.member_id,
        extra={"decision": "execute"},
    )
    connector = get_connector()
    result = connector.execute(intention, attestation)
    append_event(
        "executed" if result.success else "failed",
        intention_id=intention.id,
        connector=intention.connector,
        channel=body.channel,
        artifact_url=result.artifact_url,
        member_id=body.member_id,
        extra={"error": result.error} if result.error else None,
    )
    if result.success:
        intention_store.delete(intention.id)
    return ExecutionResultOut(**result.to_dict())


@router.get("/intentions", response_model=IntentionListOut)
def list_intentions() -> IntentionListOut:
    _require_fresh_gate5()
    out: list[IntentionOut] = []
    # ``store`` doesn't yet expose a list helper; iterate the directory.
    from connectors.store import _STORE_DIR  # type: ignore[attr-defined]

    if _STORE_DIR.exists():
        for path in sorted(_STORE_DIR.glob("*.json")):
            intention = intention_store.load(path.stem)
            if intention is not None:
                out.append(IntentionOut(**intention.to_dict()))
    return IntentionListOut(intentions=out)


@router.delete("/intentions/{intention_id}")
def drop_intention(intention_id: str) -> dict:
    _require_fresh_gate5()
    intention = intention_store.load(intention_id)
    if intention is None:
        raise HTTPException(status_code=404, detail="not found")
    intention_store.delete(intention_id)
    append_event(
        "decided",
        intention_id=intention_id,
        connector=intention.connector,
        extra={"decision": "drop"},
    )
    return {"dropped": intention_id}
