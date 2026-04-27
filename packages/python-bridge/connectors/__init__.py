"""connectors — external actions HMAN takes on a member's behalf.

The Connector contract is mirrored from ``packages/core/src/connectors/``
so the Python bridge can ``draft`` and ``execute`` without needing a Node
sidecar. The TypeScript module remains the canonical reference for
browser/Node consumers; this Python module owns the bridge-side path.

Public surface::

    from connectors import GitHubConnector, sign_attestation, hash_intention
    from connectors.types import Intention, PACTAttestation, ExecutionResult
    from connectors.audit import append_event
"""
from __future__ import annotations

from .github import GitHubConnector
from .pact import sign_attestation, hash_intention, render_attestation_block
from .types import Intention, PACTAttestation, ExecutionResult
from .audit import append_event

__all__ = [
    "GitHubConnector",
    "Intention",
    "PACTAttestation",
    "ExecutionResult",
    "sign_attestation",
    "hash_intention",
    "render_attestation_block",
    "append_event",
]
