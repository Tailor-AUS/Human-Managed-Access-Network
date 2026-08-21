# How you register a .HMAN

There is **no public signup** and **no handle registry**.

`.HMAN` is a local-first human harness. You register by enrolling **your voice on your machine**. That creates a member on *that* device. It does not mint a public name like `you.hman` on the internet.

## The only live door

1. Clone this repo.
2. Install and start the local bridge (Python, loopback only):

```bash
cd packages/python-bridge
python -m venv .venv && . .venv/Scripts/activate   # or source .venv/bin/activate
pip install -r requirements.txt
python api/server.py    # 127.0.0.1:8765
```

3. Start the dashboard:

```bash
cd apps/web-dashboard
npm install && npm run dev    # http://localhost:5173/
```

4. Open the dashboard. Complete **Onboarding**: passphrase (≥8 characters) + the spoken prompts. The bridge writes an encrypted voice reference under `~/.hman/identity/` and an enrolment audit under `~/.hman/enrollment/`.

That is registration. Re-enrol only if you want a new voice print. Another computer needs its own enrol (or this machine’s `~/.hman` plus the passphrase). Nothing is published to a global namespace.

Headless enrol: `packages/python-bridge` `enrollment/enroll_voice.py`.

Full local quick start: [README.md](../README.md#quick-start-desktop-prototype). Production tunnel (still *your* bridge): [DEPLOYMENT.md](../DEPLOYMENT.md).

## Doors that are not registration

| URL / path | What it actually is |
|---|---|
| `https://hman.tailor.au/` | Prototype front door. Talks to *your* already-running bridge via Relay. Does not mint handles. |
| `https://sovrgn.ai/hman` | **404.** Sovrgn is the inference market. It does not enrol humans. |
| `https://aink.tailor.au/connect/hman` | Bridge-connect: mint a `baink:*` API key for an **existing** HMAN. Not enrol. |
| Tailor managed-HMAN (`tailor-app` #2848) | Intended hosted `did:web` path. **Not built.** Do not invent this flow in chat. |
| Signal “start / code” | Pairing an already-enrolled member to an AI. Not first-time register. |

## What you get (and do not get)

You get: a local `member_id`, a voice-bound gate, vaults, an append-only audit log, and the ability to issue PACT §17 proofs from this device.

You do **not** get: a public `name.hman` handle, ASIC / CommBiz access, or the ability to push supplier payments. Asking someone to pay is an **AINK** job. Agreement is **PACT**. Intelligence trading is **Sovrgn**. Family map: [PACT family doctrine](https://github.com/TailorAU/pact/blob/main/docs/PACT_FAMILY.md).

## Agent rule

Do not invent a register form. Do not ask a member to “sign up on sovrgn.ai.” If they already have `~/.hman/` on their machine, they are enrolled. Do not write a member’s local id or home path into this public repo.
