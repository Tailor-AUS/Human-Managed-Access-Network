"""GitHubConnector — Python mirror of ``packages/core/src/connectors/github.ts``.

The bridge process owns the ``draft`` / ``execute`` path here so it can
run without a Node sidecar. The TypeScript module is the canonical
reference for browser/Node consumers; both must agree on the wire shape
or attestations won't verify across languages.

Configuration via environment:
  - ``HMAN_GITHUB_TOKEN``       fine-grained PAT with ``issues:write``
  - ``HMAN_GITHUB_DEFAULT_OWNER`` repo owner the LLM defaults to
  - ``HMAN_GITHUB_DEFAULT_REPO``  repo name the LLM defaults to
  - ``HMAN_GITHUB_ALLOWED_REPOS``  comma-separated ``owner/repo`` whitelist
  - ``HMAN_LLM_ENDPOINT``         Ollama-compatible chat endpoint
                                  (default: http://localhost:11434/api/chat)
  - ``HMAN_LLM_MODEL``            default: ``llama3.2:3b``
"""
from __future__ import annotations

import json
import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Optional

import requests

from .pact import render_attestation_block
from .types import ExecutionResult, Intention, PACTAttestation


_DRAFT_SYSTEM_PROMPT = """You are HMAN's drafting subconscious. The member casually mentioned a bug or feature request in conversation. Turn what they said into a concise, actionable GitHub issue.

Output ONLY a JSON object on a single line with two keys: "title" and "body".

Rules:
- "title" is under 70 chars, imperative mood, no trailing period.
- "body" is plain Markdown. Open with one sentence stating the problem or request from the member's point of view, then a short "## Context" section quoting their actual words verbatim.
- Don't fabricate symptoms, error messages, or stack traces the member didn't say.
- Don't add labels, milestones, or assignees - the LLM does NOT auto-categorize.
- Don't include any HMAN attestation block - that's appended separately.
"""


@dataclass
class GitHubConnectorConfig:
    default_owner: str
    default_repo: str
    allowed_repos: Optional[list[tuple[str, str]]] = None
    llm_endpoint: str = "http://localhost:11434/api/chat"
    llm_model: str = "llama3.2:3b"
    token: Optional[str] = None
    api_base: str = "https://api.github.com"

    @classmethod
    def from_env(cls) -> "GitHubConnectorConfig":
        allowed_raw = os.environ.get("HMAN_GITHUB_ALLOWED_REPOS", "").strip()
        allowed: Optional[list[tuple[str, str]]] = None
        if allowed_raw:
            allowed = []
            for entry in allowed_raw.split(","):
                entry = entry.strip()
                if "/" in entry:
                    owner, repo = entry.split("/", 1)
                    allowed.append((owner.strip(), repo.strip()))
        return cls(
            default_owner=os.environ.get("HMAN_GITHUB_DEFAULT_OWNER", "Tailor-AUS"),
            default_repo=os.environ.get(
                "HMAN_GITHUB_DEFAULT_REPO", "Human-Managed-Access-Network"
            ),
            allowed_repos=allowed,
            llm_endpoint=os.environ.get("HMAN_LLM_ENDPOINT", "http://localhost:11434/api/chat"),
            llm_model=os.environ.get("HMAN_LLM_MODEL", "llama3.2:3b"),
            token=os.environ.get("HMAN_GITHUB_TOKEN") or None,
        )


def parse_draft_reply(reply: str, context: str) -> tuple[str, str]:
    """Extract ``{title, body}`` from an LLM reply.

    Mirrors the TypeScript ``parseDraftReply`` — falls back to a stub
    issue using the raw context if parsing fails so we never silently
    drop the member's words.
    """
    # Find the first {...} JSON-shaped substring.
    start = reply.find("{")
    end = reply.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            parsed = json.loads(reply[start : end + 1])
            title = parsed.get("title")
            body = parsed.get("body")
            if isinstance(title, str) and title.strip() and isinstance(body, str) and body.strip():
                return (title.strip()[:120], body.strip())
        except Exception:
            pass

    trimmed = re.sub(r"\s+", " ", context.strip())
    title = (trimmed[:67] + "...") if len(trimmed) > 70 else (trimmed or "Untitled issue from voice draft")
    body = (
        f"## Context\n\n> {trimmed or '(no context captured)'}\n\n"
        "_Drafted by HMAN - the LLM did not return a structured response, "
        "so this is a verbatim quote of the member's words._"
    )
    return (title, body)


class GitHubConnector:
    """Mirror of ``GitHubConnector`` (TS). ``draft`` + ``execute`` + ``undo``."""

    name = "github"

    def __init__(
        self,
        config: Optional[GitHubConnectorConfig] = None,
        *,
        llm_chat: Optional[Callable[[str, str], str]] = None,
        http_post: Optional[Callable[..., Any]] = None,
        http_patch: Optional[Callable[..., Any]] = None,
        now: Optional[Callable[[], datetime]] = None,
    ):
        self.config = config or GitHubConnectorConfig.from_env()
        self._llm_chat = llm_chat or self._default_llm_chat
        self._http_post = http_post or requests.post
        self._http_patch = http_patch or requests.patch
        self._now = now or (lambda: datetime.now(timezone.utc))

    # ── default LLM call ────────────────────────────────────────────

    def _default_llm_chat(self, system: str, user: str) -> str:
        res = requests.post(
            self.config.llm_endpoint,
            json={
                "model": self.config.llm_model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "stream": False,
                "options": {"temperature": 0.2},
            },
            timeout=60,
        )
        res.raise_for_status()
        data = res.json()
        return (data.get("message") or {}).get("content", "").strip()

    # ── draft ───────────────────────────────────────────────────────

    def draft(self, *, context: str, member_id: Optional[str] = None) -> Intention:
        try:
            reply = self._llm_chat(_DRAFT_SYSTEM_PROMPT, context)
        except Exception:
            reply = ""  # fall through to stub
        title, body = parse_draft_reply(reply, context)
        # ``member_id`` reserved for future routing; not yet used in
        # default-repo selection.
        _ = member_id
        return Intention(
            id=str(uuid.uuid4()),
            connector=self.name,
            action="issue.create",
            payload={
                "owner": self.config.default_owner,
                "repo": self.config.default_repo,
                "title": title,
                "body": body,
            },
            description=f'File a GitHub issue: "{title}"',
            urgency=0.3,
            context=context,
            drafted_at=self._now().isoformat(),
        )

    # ── execute ─────────────────────────────────────────────────────

    def execute(self, intention: Intention, attestation: PACTAttestation) -> ExecutionResult:
        from .pact import hash_intention

        expected = hash_intention(intention)
        if attestation.intention_hash != expected:
            return ExecutionResult(
                success=False,
                attestation=attestation,
                error=(
                    f"attestation/intention hash mismatch "
                    f"(expected {expected}, got {attestation.intention_hash})"
                ),
            )

        owner = intention.payload.get("owner")
        repo = intention.payload.get("repo")
        title = intention.payload.get("title")
        body = intention.payload.get("body")
        if not (owner and repo and title and body):
            return ExecutionResult(
                success=False,
                attestation=attestation,
                error="payload missing owner/repo/title/body",
            )

        if self.config.allowed_repos and (owner, repo) not in self.config.allowed_repos:
            return ExecutionResult(
                success=False,
                attestation=attestation,
                error=f"repo {owner}/{repo} not in allowed_repos whitelist",
            )

        token = self.config.token
        if not token:
            return ExecutionResult(
                success=False,
                attestation=attestation,
                error=(
                    "HMAN_GITHUB_TOKEN not set - cannot call GitHub. "
                    "Use a fine-grained PAT with issues:write on the whitelisted repo."
                ),
            )

        composed_body = f"{body.strip()}\n\n{render_attestation_block(attestation)}\n"
        url = f"{self.config.api_base}/repos/{owner}/{repo}/issues"
        try:
            res = self._http_post(
                url,
                json={"title": title, "body": composed_body},
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                timeout=30,
            )
        except Exception as e:
            return ExecutionResult(success=False, attestation=attestation, error=str(e))

        if not getattr(res, "ok", False):
            text = getattr(res, "text", "")[:200]
            return ExecutionResult(
                success=False,
                attestation=attestation,
                error=f"GitHub issue create failed: {res.status_code} {text}",
            )

        data = res.json()
        return ExecutionResult(
            success=True,
            attestation=attestation,
            artifact_url=data.get("html_url"),
            artifact_id=f"{owner}/{repo}#{data.get('number')}",
        )

    # ── undo ────────────────────────────────────────────────────────

    def undo(self, result: ExecutionResult) -> None:
        if not result.success or not result.artifact_id:
            return
        m = re.match(r"^([^/]+)/([^#]+)#(\d+)$", result.artifact_id)
        if not m:
            raise RuntimeError(f"cannot parse artifact_id for undo: {result.artifact_id}")
        owner, repo, num = m.group(1), m.group(2), int(m.group(3))
        token = self.config.token
        if not token:
            raise RuntimeError("HMAN_GITHUB_TOKEN not set")
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        # Post a "rescinded" comment, then close the issue.
        comment_url = f"{self.config.api_base}/repos/{owner}/{repo}/issues/{num}/comments"
        self._http_post(
            comment_url,
            json={
                "body": (
                    "Closed by HMAN: member rescinded consent for this action. "
                    "Original PACT attestation in the issue body remains valid history."
                )
            },
            headers=headers,
            timeout=30,
        )
        close_url = f"{self.config.api_base}/repos/{owner}/{repo}/issues/{num}"
        self._http_patch(
            close_url,
            json={"state": "closed", "state_reason": "not_planned"},
            headers=headers,
            timeout=30,
        )
