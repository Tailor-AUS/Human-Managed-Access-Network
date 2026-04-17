# .HMAN

**Your personal subconscious. Local. Encrypted. Yours.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Built on PACT](https://img.shields.io/badge/built%20on-PACT-blue)](https://github.com/Tailor-AUS/pact)

---

## What is .HMAN?

.HMAN is a platform for personal AI that stays on your device. It runs a
local LLM (Gemma, Llama), binds to your voice alone, and gates every
action through your explicit consent. No cloud. No telemetry. No foreign
dependency.

It is a subconscious layer that you own — designed to scale to one member
now and seven billion members eventually.

.HMAN enforces **five gates** at the architecture level:

1. **Light Bulb Moment** — activates only when you consciously invoke it
2. **Member Control** — your data, your keys, encrypted at rest
3. **Extension of Thinking** — first-person inner voice, not an assistant
4. **Reactive & Non-Invasive** — never interrupts uninvited
5. **Voice-Bound** — only your voice activates it, only you hear it

> *"These five gates will tell you if .HMAN is actually working as
> intended, or if it's just another surveillance device wearing a friendly
> mask."*

---

## Components

```
apps/
  web-dashboard/           ← React/Vite front door + member app
                              http://localhost:5173
packages/
  core/                    ← TypeScript SDK (access gate, vaults, audit)
  mcp-server/              ← MCP integration for Claude Desktop, etc.
  shared/                  ← shared types
  python-bridge/           ← local HTTP bridge (voice ID, enrolment, gates)
                              http://127.0.0.1:8765
docs/
  VISION.md                ← the five-gate manifesto
```

---

## Quick start (desktop prototype)

Requires Node 18+, Python 3.11+, and a CUDA-capable GPU recommended.

```bash
# Clone
git clone https://github.com/Tailor-AUS/Human-Managed-Access-Network
cd Human-Managed-Access-Network

# Platform (TypeScript)
pnpm install
pnpm -r build

# Local bridge (Python)
cd packages/python-bridge
python -m venv .venv && . .venv/Scripts/activate    # or source .venv/bin/activate
pip install -r requirements.txt
python api/server.py    # runs on localhost:8765

# Web app (new terminal)
cd apps/web-dashboard
npm run dev             # opens localhost:5173
```

Open `http://localhost:5173/` — that's your front door. Follow the
Onboarding flow to enrol your voice. From there, every action .HMAN takes
on your behalf is cryptographically gated to you.

---

## Deploy to production

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full prod stack (Cloudflare Pages
for the static frontend + Cloudflare Tunnel for the bridge + Windows
auto-start task). Once set up, a sovereign deploy looks like:

```
https://hman.tailor.au          → front door (Cloudflare Pages)
https://hman.tailor.au/app      → member app
https://bridge.tailor.au        → your desktop bridge (over tunnel)
~/.hman/                         → encrypted voice reference, audit log
```

No cloud model inference. No open ports. Your hardware, your keys, your
consent on every action.

---

## Signal-based flow (earlier pattern)

In addition to the local-first app, .HMAN also supports a Signal-based
approval flow for remote devices and allied-AI integrations:

---

## Quick Start

1. **Add .HMAN on Signal** → Send "start"
2. **Generate a code** → Send "code"
3. **Get a 6-char code** → `X7K3PQ` (valid 60 seconds)
4. **Give to AI** → "Connect with my .HMAN code: X7K3PQ"
5. **Approve requests** → Reply Y/N on Signal

---

## Example

```
You: code

.HMAN: Your session code:
       X7K3PQ
       Valid for 60 seconds

--- You give code to Claude ---

Claude: "I've connected to your .HMAN"

--- Claude requests calendar ---

.HMAN: Claude wants your calendar.
       Y to approve
       N to deny

You: Y

.HMAN: ✓ Shared with Claude.
```

---

## Why Dynamic Codes?

| Feature | Benefit |
|---------|---------|
| **60-second expiry** | Nothing to leak |
| **You generate** | You're always in control |
| **Single use** | One session per code |
| **Via Signal** | E2E encrypted, private |

---

## Commands

| Send | Get |
|------|-----|
| `start` | Welcome + setup |
| `code` | Session code (60s) |
| `status` | Active connections |
| `revoke` | End all sessions |
| `help` | Command list |

---

## For Developers

See [PROTOCOL.md](PROTOCOL.md) for API docs.

```typescript
import { Hman } from '@hman/sdk';

const session = await Hman.link('X7K3PQ', 'My App');
const calendar = await session.request('calendar');
```

---

## Links

- [Vision](VISION.md) - Why we built this
- [Protocol](PROTOCOL.md) - Technical details
- [Architecture](ARCHITECTURE.md) - Code structure

---

**Free. Open source. Your data, your control.**

[GitHub](https://github.com/Tailor-AUS/Human-Managed-Access-Network)
