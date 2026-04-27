"""Connector wire shapes (mirrors ``packages/core/src/connectors/Connector.ts``).

These are plain dataclasses — they serialise to/from JSON via
``dataclasses.asdict`` and ``cls(**data)``. Keep field names aligned
with the TypeScript contract or attestations won't verify across
languages.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Optional


# ── PACT attestation ────────────────────────────────────────────────


@dataclass
class PACTAttestation:
    """Proof a connector embeds alongside the external action."""

    member_id: str
    intention_hash: str
    channel: str  # "voice" | "text" | "queue"
    timestamp: str
    public_key: str  # base64 of the PEM-encoded Ed25519 public key
    signature: str  # base64 of the raw Ed25519 signature

    def to_dict(self) -> dict[str, Any]:
        # Camel-case for JSON parity with the TypeScript shape.
        return {
            "memberId": self.member_id,
            "intentionHash": self.intention_hash,
            "channel": self.channel,
            "timestamp": self.timestamp,
            "publicKey": self.public_key,
            "signature": self.signature,
        }


# ── Intention ───────────────────────────────────────────────────────


@dataclass
class Intention:
    """What HMAN is *thinking about* doing, before consent.

    ``payload`` is connector-specific. For GitHub it's
    ``{"owner": ..., "repo": ..., "title": ..., "body": ...}``.
    """

    id: str
    connector: str
    action: str
    payload: dict[str, Any]
    description: str
    urgency: float
    drafted_at: str
    context: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "connector": self.connector,
            "action": self.action,
            "payload": self.payload,
            "description": self.description,
            "urgency": self.urgency,
            "context": self.context,
            "draftedAt": self.drafted_at,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Intention":
        return cls(
            id=data["id"],
            connector=data["connector"],
            action=data["action"],
            payload=data["payload"],
            description=data["description"],
            urgency=float(data["urgency"]),
            context=data.get("context"),
            drafted_at=data.get("draftedAt") or data.get("drafted_at") or "",
        )


# ── ExecutionResult ─────────────────────────────────────────────────


@dataclass
class ExecutionResult:
    success: bool
    attestation: PACTAttestation
    artifact_url: Optional[str] = None
    artifact_id: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "artifactUrl": self.artifact_url,
            "artifactId": self.artifact_id,
            "attestation": self.attestation.to_dict(),
            "error": self.error,
        }
