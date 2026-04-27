# PACT-GitHub connector — end-to-end loop

This walks through the first concrete external action HMAN takes on a member's
behalf: speak a bug into the room → subconscious drafts an issue → receptivity
gate decides when to surface it → on consent Y, an authorized member action
lands on GitHub with a verifiable PACT attestation.

The same shape is the template for every future connector (Bank, Tailor,
Calendar). Get this loop right; everything else inherits.

## Prerequisites

1. Bridge running on `localhost:8765` (see `DEPLOYMENT.md`).
2. Voice enrolled (Gate 5) and *armed* (`/api/gate5/unlock`). The connector
   re-checks Gate 5 freshness on every draft and execute.
3. Local Ollama (or compatible OpenAI-style chat endpoint) reachable at
   `HMAN_LLM_ENDPOINT` (default `http://localhost:11434/api/chat`) with a model
   named in `HMAN_LLM_MODEL` (default `llama3.2:3b`).
4. A fine-grained GitHub PAT in `HMAN_GITHUB_TOKEN` with **only**
   `issues:write` on the whitelisted repos. Never use a classic `repo` token —
   the blast radius is too large.

### Minimum env

```bash
export HMAN_GITHUB_TOKEN="github_pat_..."
export HMAN_GITHUB_DEFAULT_OWNER="your-org"
export HMAN_GITHUB_DEFAULT_REPO="your-repo"
export HMAN_GITHUB_ALLOWED_REPOS="your-org/your-repo,your-org/other-repo"
```

`HMAN_GITHUB_ALLOWED_REPOS` is a hard whitelist — if the LLM somehow picks an
owner/repo not in the list, `execute` returns a structured error and never
calls GitHub.

### Token onboarding (once per machine)

1. Visit `https://github.com/settings/personal-access-tokens/new`.
2. **Resource owner**: pick the org the issues will be filed against.
3. **Repository access**: *Only select repositories* → check exactly the repos
   in `HMAN_GITHUB_ALLOWED_REPOS`.
4. **Repository permissions** → *Issues* → *Read and write*. Leave everything
   else as *No access*.
5. Expiration: 90 days max. Calendar a rotation reminder.
6. Copy the token, paste into `bridge.env` (or your shell rc):
   `HMAN_GITHUB_TOKEN=github_pat_...`. Restart the bridge.

The bridge stores the token only in process memory. Rotation is a restart.

## End-to-end flow

```
Voice agent (in conversation)
  "...this Muse handshake is annoying, presets keep returning rc:69..."
        ↓
LLM drafts {title, body} from the transcript snippet
        ↓
HMAN packages an Intention { connector: "github", action: "issue.create",
                             payload: { owner, repo, title, body },
                             urgency: 0.3, context: "<transcript>" }
        ↓
intention persisted to ~/.hman/connector_intentions/<id>.json
        ↓
receptivity gate (#4) ticks: (score, channel) → ("surface_now", "voice"|"text")
        ↓
on surface_now: voice agent says "drafted an issue about the Muse — file it?"
        ↓
member: "Y" (voice biometric verified) or taps Y in Signal
        ↓
PACT signs attestation: {member_id, intention_hash, channel, timestamp, sig}
        ↓
bridge calls gh API: POST /repos/{owner}/{repo}/issues with body containing
        { ...payload, attestation: <collapsed details block> }
        ↓
issue URL appended to ~/.hman/logs/connector_events.jsonl
        ↓
member optionally hears "filed, link is in your queue"
```

## Per-step curl recipes

You'll want to test each step independently while wiring up new clients.
Replace `$T` with your bridge bearer token (`HMAN_AUTH_TOKEN`) and `$ID` with
the intention id returned by the draft step.

### 0. Confirm Gate 5 is armed and recently active

```bash
curl -sS -H "Authorization: Bearer $T" http://127.0.0.1:8765/api/gate5/status | jq
```

You need `armed: true` and a `last_activation` within the last 60s. If
`last_activation` is older, hit `/api/gate5/verify` with a fresh utterance to
refresh the freshness window before drafting.

### 1. Draft an Intention

```bash
curl -sS -X POST http://127.0.0.1:8765/api/connectors/github/draft \
  -H "Authorization: Bearer $T" \
  -H "Content-Type: application/json" \
  -d '{
    "context": "the muse handshake is failing — presets keep coming back rc:69 and EEG never starts streaming"
  }' | jq
```

Response (camelCase JSON, 200 OK):

```json
{
  "id": "f6c9a3b2-...",
  "connector": "github",
  "action": "issue.create",
  "payload": {
    "owner": "your-org",
    "repo": "your-repo",
    "title": "Muse handshake fails: presets return rc:69, EEG never streams",
    "body": "The Muse handshake fails repeatedly. ... ## Context\n\n> the muse handshake is failing — presets keep coming back rc:69 and EEG never starts streaming"
  },
  "description": "File a GitHub issue: \"Muse handshake fails: presets return rc:69, EEG never streams\"",
  "urgency": 0.3,
  "context": "the muse handshake is failing ...",
  "draftedAt": "2026-04-26T12:34:56.789012+00:00"
}
```

The intention is now in `~/.hman/connector_intentions/<id>.json`. The dashboard
RequestsPage will pick it up on next render.

### 2. Ask the receptivity gate when to surface it

```bash
curl -sS -X POST http://127.0.0.1:8765/api/receptivity/evaluate \
  -H "Authorization: Bearer $T" \
  -H "Content-Type: application/json" \
  -d '{
    "intention": {
      "id": "f6c9a3b2-...",
      "description": "File a GitHub issue: ...",
      "urgency": "low",
      "estimated_voice_words": 18
    }
  }' | jq
```

Response:

```json
{
  "surface_now": true,
  "channel": "text",
  "reason": "Drafted: File a GitHub issue: \"Muse handshake fails ...\"",
  "score": 0.71,
  "budget_words_remaining": 22,
  "budget_interruptions_today": 1
}
```

The gate decides — the connector never surfaces itself. `channel="queue"`
means hold; `text` means whisper via Signal; `voice` means whisper aloud.

### 3. Member consents → execute

```bash
curl -sS -X POST http://127.0.0.1:8765/api/connectors/github/execute \
  -H "Authorization: Bearer $T" \
  -H "Content-Type: application/json" \
  -d '{
    "intentionId": "f6c9a3b2-...",
    "channel": "voice",
    "member_id": "member"
  }' | jq
```

Response (200 OK):

```json
{
  "success": true,
  "artifactUrl": "https://github.com/your-org/your-repo/issues/123",
  "artifactId": "your-org/your-repo#123",
  "attestation": {
    "memberId": "member",
    "intentionHash": "e62c780a1b...",
    "channel": "voice",
    "timestamp": "2026-04-26T12:35:42.111+00:00",
    "publicKey": "<base64 PEM>",
    "signature": "<base64 ed25519>"
  },
  "error": null
}
```

The issue body on GitHub will end with a collapsed `<details>` block:

````markdown
... LLM body ...

<!-- HMAN PACT attestation — verifies this issue was an authorized member action. -->
<details>
<summary>HMAN PACT attestation</summary>

```json
{
  "memberId": "member",
  "intentionHash": "e62c780a1b...",
  "channel": "voice",
  "timestamp": "2026-04-26T12:35:42.111+00:00",
  "publicKey": "...",
  "signature": "..."
}
```

_Verify this signature with the public key above against the canonical hash of the issue payload._
</details>
````

Anyone reading the issue can recompute the canonical hash from the issue
title + body (stripped of the attestation block) and verify the signature with
the embedded public key. No HMAN-side service is needed to verify.

### 4. Member changes mind → undo

```bash
# the connector also exposes a programmatic undo path
curl -sS -X DELETE http://127.0.0.1:8765/api/connectors/github/intentions/$ID \
  -H "Authorization: Bearer $T"
```

For an *executed* intention (the issue is already up), HMAN closes the issue
with a "rescinded by member" comment. The original PACT attestation in the
body remains as a public history of the authorized action — undo doesn't
falsify the record.

### 5. Audit

Every step appends a line to `~/.hman/logs/connector_events.jsonl`:

```json
{"ts": "...", "event": "drafted",  "intention_id": "f6c...", "connector": "github", "extra": {...}}
{"ts": "...", "event": "decided",  "intention_id": "f6c...", "connector": "github", "channel": "voice", "extra": {"decision": "execute"}}
{"ts": "...", "event": "executed", "intention_id": "f6c...", "connector": "github", "channel": "voice", "artifact_url": "https://github.com/.../issues/123"}
```

`tail -f ~/.hman/logs/connector_events.jsonl | jq` while running through the
demo to watch the lifecycle in real time.

## What can go wrong

| Symptom | Cause | Fix |
|---|---|---|
| `401 Gate 5 not fresh` on draft | Last Gate-5 activation > 60s ago | Speak something — `/api/gate5/verify` refreshes |
| `503 Gate 5 freshness check not configured` | Bridge started without registering the check | Restart bridge — `server.py` wires it on import |
| `error: HMAN_GITHUB_TOKEN not set` | Token missing or empty | Set `HMAN_GITHUB_TOKEN`, restart bridge |
| `error: repo X/Y not in allowed_repos whitelist` | LLM picked a repo outside the whitelist | Check `HMAN_GITHUB_ALLOWED_REPOS` |
| `error: attestation/intention hash mismatch` | Intention was modified after signing | Don't mutate Intentions between draft and execute |
| `error: GitHub issue create failed: 401` | PAT expired or revoked | Rotate the token |
| `error: GitHub issue create failed: 403` | PAT scope insufficient | Re-create PAT with `Issues: Read and write` |

## Cross-language verification

The TypeScript `@hman/core` package exports the same hashing and attestation
helpers (`hashIntention`, `signAttestation`, `renderAttestationBlock`). Hashes
computed in TS and Python over the same Intention are byte-for-byte identical
(SHA-256 over a canonical JSON encoding with stable key order and minimal
separators). A browser or Node consumer can verify a PACT attestation produced
by the Python bridge — and vice versa — without HMAN-specific tooling.
