"""
Tests for the Python connector subsystem.

These mirror the TS tests in ``packages/core/src/__tests__/connectors.test.ts``
and additionally cover the on-disk Intention store and PACT signing
round-trips.
"""
from __future__ import annotations

import json
import os
import sys
from base64 import b64decode
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# Make sibling module importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture(autouse=True)
def isolate_hman_dir(tmp_path, monkeypatch):
    """Every test gets a fresh HMAN_DATA_DIR so they can't observe each other's state."""
    monkeypatch.setenv("HMAN_DATA_DIR", str(tmp_path))
    # Reload the modules that cache the resolved path at import time.
    for mod in list(sys.modules):
        if mod.startswith("connectors"):
            del sys.modules[mod]
    yield


def test_hash_intention_deterministic():
    from connectors.types import Intention
    from connectors.pact import hash_intention

    i = Intention(
        id="i1",
        connector="github",
        action="issue.create",
        payload={"owner": "x", "repo": "y", "title": "t", "body": "b"},
        description="d",
        urgency=0.3,
        drafted_at="2026-04-26T00:00:00+00:00",
    )
    assert hash_intention(i) == hash_intention(i)


def test_hash_intention_changes_when_payload_changes():
    from connectors.types import Intention
    from connectors.pact import hash_intention

    i1 = Intention(
        id="i1", connector="github", action="issue.create",
        payload={"owner": "x", "repo": "y", "title": "t", "body": "b"},
        description="d", urgency=0.3, drafted_at="t",
    )
    i2 = Intention(
        id="i1", connector="github", action="issue.create",
        payload={"owner": "x", "repo": "y", "title": "t2", "body": "b"},
        description="d", urgency=0.3, drafted_at="t",
    )
    assert hash_intention(i1) != hash_intention(i2)


def test_sign_attestation_round_trips():
    from connectors.types import Intention
    from connectors.pact import sign_attestation, hash_intention
    from cryptography.hazmat.primitives import serialization

    i = Intention(
        id="i1", connector="github", action="issue.create",
        payload={"owner": "x", "repo": "y", "title": "t", "body": "b"},
        description="d", urgency=0.3, drafted_at="t",
    )
    att = sign_attestation(i, member_id="member-abc", channel="voice")
    assert att.intention_hash == hash_intention(i)

    # Re-derive canonical bytes and verify with the embedded public key.
    canonical = json.dumps(
        {
            "memberId": "member-abc",
            "intentionHash": att.intention_hash,
            "channel": "voice",
            "timestamp": att.timestamp,
        },
        separators=(",", ":"),
    ).encode("utf-8")
    pem = b64decode(att.public_key.encode()).decode("utf-8")
    pub = serialization.load_pem_public_key(pem.encode())
    pub.verify(b64decode(att.signature.encode()), canonical)  # raises on failure


def test_parse_draft_reply_well_formed_json():
    from connectors.github import parse_draft_reply

    title, body = parse_draft_reply(
        '{"title":"Fix Muse handshake","body":"## Context\\n> handshake fails"}',
        "irrelevant context",
    )
    assert title == "Fix Muse handshake"
    assert "handshake fails" in body


def test_parse_draft_reply_extracts_json_from_prose():
    from connectors.github import parse_draft_reply

    title, body = parse_draft_reply(
        'Sure, here is your draft:\n{"title":"X","body":"Y"}\nGood luck!',
        "ctx",
    )
    assert title == "X"
    assert body == "Y"


def test_parse_draft_reply_falls_back_on_garbage():
    from connectors.github import parse_draft_reply

    title, body = parse_draft_reply(
        "this is just words with no JSON whatsoever",
        "the muse handshake is annoying",
    )
    assert title  # non-empty
    assert "muse handshake is annoying" in body


def test_intention_store_persists_and_loads():
    from connectors.types import Intention
    from connectors import store as intention_store

    i = Intention(
        id="abc-123", connector="github", action="issue.create",
        payload={"owner": "x", "repo": "y", "title": "t", "body": "b"},
        description="d", urgency=0.3, drafted_at="t",
    )
    intention_store.save(i)
    loaded = intention_store.load("abc-123")
    assert loaded is not None
    assert loaded.id == "abc-123"
    assert loaded.payload["title"] == "t"

    intention_store.delete("abc-123")
    assert intention_store.load("abc-123") is None


def test_github_connector_draft_returns_typed_intention():
    from connectors.github import GitHubConnector, GitHubConnectorConfig

    config = GitHubConnectorConfig(default_owner="example", default_repo="repo", token="dummy")
    connector = GitHubConnector(
        config=config,
        llm_chat=lambda system, user: '{"title":"Fix it","body":"It is broken."}',
    )
    intention = connector.draft(context="this thing is broken")
    assert intention.connector == "github"
    assert intention.action == "issue.create"
    assert intention.payload["owner"] == "example"
    assert intention.payload["repo"] == "repo"
    assert intention.payload["title"] == "Fix it"
    assert 0 < intention.urgency <= 1
    assert intention.id  # uuid


def test_github_connector_execute_rejects_hash_mismatch():
    from connectors.github import GitHubConnector, GitHubConnectorConfig
    from connectors.pact import sign_attestation

    config = GitHubConnectorConfig(default_owner="example", default_repo="repo", token="dummy")
    connector = GitHubConnector(
        config=config,
        llm_chat=lambda system, user: '{"title":"X","body":"Y"}',
    )
    intention = connector.draft(context="ctx")
    attestation = sign_attestation(intention, member_id="m", channel="voice")
    # Tamper after signing
    intention.payload["title"] = "tampered"
    result = connector.execute(intention, attestation)
    assert not result.success
    assert "hash mismatch" in (result.error or "")


def test_github_connector_execute_rejects_unwhitelisted_repo():
    from connectors.github import GitHubConnector, GitHubConnectorConfig
    from connectors.pact import sign_attestation

    config = GitHubConnectorConfig(
        default_owner="example",
        default_repo="repo",
        token="dummy",
        allowed_repos=[("allowed", "thing")],
    )
    connector = GitHubConnector(
        config=config,
        llm_chat=lambda system, user: '{"title":"X","body":"Y"}',
    )
    intention = connector.draft(context="ctx")
    attestation = sign_attestation(intention, member_id="m", channel="voice")
    result = connector.execute(intention, attestation)
    assert not result.success
    assert "whitelist" in (result.error or "")


def test_github_connector_execute_embeds_attestation_in_body():
    from connectors.github import GitHubConnector, GitHubConnectorConfig
    from connectors.pact import sign_attestation

    captured = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        captured["url"] = url
        captured["body"] = json["body"]
        m = MagicMock()
        m.ok = True
        m.status_code = 201
        m.json.return_value = {"number": 42, "html_url": "https://github.com/example/repo/issues/42"}
        return m

    config = GitHubConnectorConfig(default_owner="example", default_repo="repo", token="real-token")
    connector = GitHubConnector(
        config=config,
        llm_chat=lambda system, user: '{"title":"X","body":"Y"}',
        http_post=fake_post,
    )
    intention = connector.draft(context="ctx")
    attestation = sign_attestation(intention, member_id="m", channel="voice")
    result = connector.execute(intention, attestation)
    assert result.success
    assert result.artifact_url == "https://github.com/example/repo/issues/42"
    assert result.artifact_id == "example/repo#42"
    assert "<details>" in captured["body"]
    assert "HMAN PACT attestation" in captured["body"]
    assert attestation.signature in captured["body"]


def test_github_connector_execute_returns_error_when_token_missing():
    from connectors.github import GitHubConnector, GitHubConnectorConfig
    from connectors.pact import sign_attestation

    config = GitHubConnectorConfig(default_owner="example", default_repo="repo", token=None)
    connector = GitHubConnector(
        config=config,
        llm_chat=lambda system, user: '{"title":"X","body":"Y"}',
    )
    intention = connector.draft(context="ctx")
    attestation = sign_attestation(intention, member_id="m", channel="voice")
    result = connector.execute(intention, attestation)
    assert not result.success
    assert "HMAN_GITHUB_TOKEN not set" in (result.error or "")


def test_audit_append_event_writes_jsonl(tmp_path, monkeypatch):
    monkeypatch.setenv("HMAN_DATA_DIR", str(tmp_path))
    # reload audit so it picks up new env
    for mod in list(sys.modules):
        if mod.startswith("connectors"):
            del sys.modules[mod]
    from connectors.audit import append_event

    append_event("drafted", intention_id="i1", connector="github", member_id="m")
    log = tmp_path / "logs" / "connector_events.jsonl"
    assert log.exists()
    lines = log.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    rec = json.loads(lines[0])
    assert rec["event"] == "drafted"
    assert rec["intention_id"] == "i1"
    assert rec["connector"] == "github"
    assert rec["member_id"] == "m"
