"""PACT attestation primitives — sign + canonicalise.

The signing key is loaded from disk in ``~/.hman/identity/pact_ed25519.pem``.
If the file doesn't exist we generate a new keypair and persist it. This
key represents the member's identity for purposes of authorising external
actions; rotating it is a destructive step that breaks all prior issue
attestations, so the file is created with mode 0600 and never re-derived
from the passphrase.

The canonical bytes the signature commits to are:

    JSON({
        "memberId":      <str>,
        "intentionHash": <hex sha256 of canonical intention>,
        "channel":       "voice" | "text" | "queue",
        "timestamp":     <ISO-8601>,
    })

Hash of the intention itself uses a stable JSON encoding that mirrors
the TypeScript ``hashIntention`` helper.
"""
from __future__ import annotations

import hashlib
import json
import os
from base64 import b64encode
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from .types import Intention, PACTAttestation


# Resolve ~/.hman/identity once.
_DATA_ENV = os.environ.get("HMAN_DATA_DIR")
_HMAN_DIR = Path(_DATA_ENV).expanduser().resolve() if _DATA_ENV else Path.home() / ".hman"
_IDENTITY_DIR = _HMAN_DIR / "identity"
_PACT_KEY_FILE = _IDENTITY_DIR / "pact_ed25519.pem"


def _ensure_keypair() -> tuple[Ed25519PrivateKey, Ed25519PublicKey, str]:
    """Load (or generate) the member's PACT signing keypair.

    Returns the private key, the public key, and the PEM-encoded public
    key (UTF-8 string) for embedding in attestations.
    """
    _IDENTITY_DIR.mkdir(parents=True, exist_ok=True)
    if _PACT_KEY_FILE.exists():
        pem = _PACT_KEY_FILE.read_bytes()
        priv = serialization.load_pem_private_key(pem, password=None)
        if not isinstance(priv, Ed25519PrivateKey):
            raise RuntimeError(f"{_PACT_KEY_FILE} is not an Ed25519 private key")
    else:
        priv = Ed25519PrivateKey.generate()
        pem = priv.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        # Restrictive perms; on Windows os.chmod is best-effort only.
        _PACT_KEY_FILE.write_bytes(pem)
        try:
            os.chmod(_PACT_KEY_FILE, 0o600)
        except Exception:
            pass

    pub = priv.public_key()
    pub_pem = pub.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    return priv, pub, pub_pem


def hash_intention(intention: Intention) -> str:
    """Deterministic hash of an Intention. Mirrors the TS ``hashIntention``."""
    stable = {
        "id": intention.id,
        "connector": intention.connector,
        "action": intention.action,
        "payload": intention.payload,
        "description": intention.description,
        "urgency": intention.urgency,
        "context": intention.context if intention.context is not None else None,
        "draftedAt": intention.drafted_at,
    }
    canonical = json.dumps(stable, separators=(",", ":"), sort_keys=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def sign_attestation(
    intention: Intention,
    member_id: str,
    channel: str,
    *,
    timestamp: Optional[str] = None,
) -> PACTAttestation:
    """Sign a PACT attestation for the given Intention + consent moment."""
    priv, _pub, pub_pem = _ensure_keypair()
    intention_hash = hash_intention(intention)
    ts = timestamp or datetime.now(timezone.utc).isoformat()
    canonical = json.dumps(
        {
            "memberId": member_id,
            "intentionHash": intention_hash,
            "channel": channel,
            "timestamp": ts,
        },
        separators=(",", ":"),
        sort_keys=False,
    )
    sig = priv.sign(canonical.encode("utf-8"))
    return PACTAttestation(
        member_id=member_id,
        intention_hash=intention_hash,
        channel=channel,
        timestamp=ts,
        public_key=b64encode(pub_pem.encode("utf-8")).decode("ascii"),
        signature=b64encode(sig).decode("ascii"),
    )


def render_attestation_block(attestation: PACTAttestation) -> str:
    """Render an attestation as a collapsed Markdown ``<details>`` block."""
    pretty = json.dumps(attestation.to_dict(), indent=2)
    return "\n".join(
        [
            "",
            "<!-- HMAN PACT attestation — verifies this issue was an authorized member action. -->",
            "<details>",
            "<summary>HMAN PACT attestation</summary>",
            "",
            "```json",
            pretty,
            "```",
            "",
            "_Verify this signature with the public key above against the canonical hash of the issue payload._",
            "</details>",
        ]
    )
