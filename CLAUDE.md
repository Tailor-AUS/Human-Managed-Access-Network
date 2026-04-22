# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

.HMAN (Human Managed Access Network) is a privacy-first platform for sovereign personal AI. Local LLM, voice-bound biometric, consent on every action, no cloud dependency. MIT-licensed.

One pnpm workspace spans three runtimes plus IaC: a TypeScript SDK + MCP server, a Python FastAPI bridge, a .NET 9 Azure Relay listener, and a React/Vite web dashboard.

## The Five Gates (load-bearing invariants)

Every feature must pass all five — architectural invariants, not guidelines. See [VISION.md](VISION.md).

1. **Light Bulb Moment** — activates only on deliberate member signal (push-to-talk, wake phrase). Ambient audio alone must not trigger action.
2. **Member Control** — data stays on-device, encrypted, exportable/deletable.
3. **Extension of Thinking** — first-person inner-voice register, not assistant-speak.
4. **Reactive & Non-Invasive** — never initiates uninvited. No nudges/notifications.
5. **Voice-Bound** — only the enrolled member's voice activates it; rejected utterances dropped silently (no transcript stored).

If a change could weaken any gate, flag it.

## Stack layout

| Path | Runtime | Purpose |
|---|---|---|
| `packages/core/` | TS (libsodium, better-sqlite3) | SDK: crypto, vaults, audit, Signal client, bridge, messaging, delegation, payments, bots, authenticity |
| `packages/mcp-server/` | TS (@modelcontextprotocol/sdk) | MCP server `hman-gate` for Claude Desktop integration |
| `packages/shared/` | TS | Shared types |
| `packages/python-bridge/` | Python 3.11+ (FastAPI) | Local HTTP bridge on `127.0.0.1:8765` — voice enrolment, speaker verification (Resemblyzer), gate state, sensors |
| `packages/bridge-relay-listener/` | .NET 9 | Outbound-only Azure Relay listener; exposes local bridge at `bridge.<domain>` with no inbound ports |
| `apps/web-dashboard/` | React 18 + Vite + Tailwind | Member UI — TokenGate, Onboarding, Gates, Vaults, Subconscious, Memory, Audit |
| `infra/` | Bicep | SWA + Azure Relay + Key Vault + App Insights + DNS |
| `ops/` | PowerShell | Deploy/launch scripts |

## Runtime topology

```
browser → https://hman.<domain>                  (SWA or Cloudflare Pages)
       → Authorization: Bearer HMAN_AUTH_TOKEN
       → https://bridge.<domain>                 (Azure Relay OR Cloudflare Tunnel)
       → bridge-relay-listener (.NET, outbound-only)
       → http://127.0.0.1:8765                   (Python FastAPI)
       → local models (Ollama, Whisper, Piper TTS, Resemblyzer)
```

Per-member state lives in `~/.hman/` (voice embedding, enrolment audits, `gate_events.jsonl`, `bridge.env`). The decrypted voice reference only exists in bridge process memory — restart clears it, re-arm per session.

## Common commands

```bash
pnpm install
pnpm -r build
pnpm -r typecheck
pnpm -r test
pnpm -r lint

# Single vitest file
cd packages/core && pnpm vitest run src/__tests__/crypto.test.ts

# MCP server dev loop (tsx hot-reload)
pnpm --filter @hman/mcp-server dev

# Web dashboard dev (vite.config.ts says port 3000; bridge CORS defaults to 5173 too)
cd apps/web-dashboard && npm run dev

# Python bridge
cd packages/python-bridge
python -m venv .venv && . .venv/Scripts/activate
pip install -r requirements.txt
python api/server.py                    # 127.0.0.1:8765

# .NET relay listener
cd packages/bridge-relay-listener
dotnet publish -c Release -r win-x64 --self-contained false

# Bicep build (what CI does)
az bicep build --file infra/main.bicep
```

## Launching the full stack locally

```powershell
# One-shot: bridge + tunnel, reads ~/.hman/bridge.env for token + relay creds
pwsh -File ops/start-bridge.ps1 -Tunnel azure      # or cloudflare / cf-quick / none

# Auto-start on Windows login (Admin PowerShell)
pwsh -File ops/install-windows-service.ps1 -Tunnel azure
```

## Deploying

```powershell
# Azure (primary) — Bicep stack + SWA + Key Vault token + bridge.env
pwsh -File ops/azure-deploy.ps1 `
  -ResourceGroup rg-hman-prod `
  -WebDomain hman.<domain> `
  -BridgeDomain bridge.<domain> `
  -DnsZone <domain>

# Cloudflare (community)
cloudflared tunnel create hman-bridge
cd apps/web-dashboard && npm run deploy:cloudflare
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full runbook (security posture, DNS records, secret rotation, teardown, honest gaps).

## Security invariants — don't regress

- **Bearer token on every `/api/*`** — `HMAN_AUTH_TOKEN` env var on the bridge; 401 with manual CORS headers when missing (Starlette's middleware is bypassed on short-circuit responses — see [packages/python-bridge/api/server.py](packages/python-bridge/api/server.py)).
- **CORS allow-list** — `HMAN_ALLOWED_ORIGINS` (comma-separated). Dev defaults to localhost:5173/5174. Never `*`.
- **Voice reference encryption** — Fernet (AES-128-CBC + HMAC-SHA256) with PBKDF2-SHA256 600,000 iterations. Passphrase-derived. No recovery.
- **Audit log** — append-only, hash-chained JSONL at `~/.hman/logs/gate_events.jsonl`. Never truncate or rewrite.
- **No outbound network calls** from the Python bridge beyond loopback — model weights download once on first run, that's it.

## PACT relationship

.HMAN is built on PACT (`github.com/TailorAU/pact`) — the MIT protocol for inter-agent consensus/truth. When code needs PACT primitives, import from the external package. Don't vendor it into this repo.
