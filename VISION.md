# .HMAN Vision

## The Human Harness

How do you harness AI without locking yourself into a frontier model?

Every frontier provider wants to be your memory. Claude remembers you. GPT remembers you. Gemini remembers you. Each is a fragment. None is yours. When a better model arrives next quarter, your context — your habits, your preferences, who you owe money to, what your doctor said last week — stays trapped in the old one.

.HMAN inverts that. Your context lives with you. You own the memory layer. The frontier model is a replaceable engine plugged into a harness you control.

That is the whole point. .HMAN is not an assistant. It is a **human harness** for AI — a way to be the operator instead of the product.

---

## The Subconscious

.HMAN is a layer that sits between you and the world and remembers on your behalf:

- Who you are, how you like to be spoken to
- Your banking details, payment preferences, PayID / BSB / card
- Your calendar, your contacts, your obligations
- Your health signals (HRV, sleep, cognitive load) — future channels
- Your consent history — what you allowed whom to access, when

All of it stays on your device. Encrypted. Biometrically bound. Exportable. Deletable.

Your subconscious is *you*. Not Claude's mental model of you. Not Gemini's summarisation of you. **You.**

---

## The Five Gates

Every feature in .HMAN is enforced by five architectural gates:

1. **Light Bulb Moment** — activates only on deliberate member signal (push-to-talk, wake phrase). Ambient audio alone never triggers action.
2. **Member Control** — data stays on-device, encrypted, exportable, deletable. No cloud inference, no telemetry.
3. **Extension of Thinking** — first-person inner-voice register. Not assistant-speak. Not "How can I help you today?" — "remember to pay the electric bill before Friday."
4. **Reactive & Non-Invasive** — never initiates uninvited. No nudges, no notifications, no attention theft. See [Receptivity Channels](PROTOCOL.md#receptivity-channels) for how modality is chosen per interaction.
5. **Voice-Bound** — only the enrolled member's voice activates it. Rejected utterances drop silently — no transcript stored, no data collected.

A change that weakens any gate is not an improvement.

---

## Canonical Scenario: Two HMANs at a Cafe

You walk into a cafe. You have an HMAN. The cafe owner has an HMAN. The stranger next to you has an HMAN.

You order two coffees for a friend and yourself.

```
Cafe HMAN (owner's):  "two coffees, $7 total"
Your HMAN:            "accept — pay via PayID"
Cafe HMAN:            "settle to <cafe PayID alias>"
Your HMAN:            [executes settlement via your nominated rail]
Cafe HMAN:            [acks receipt]
```

No app. No QR code. No "scan to pay." Two HMANs negotiating on behalf of two people, both parties keeping their own context, both parties retaining full audit.

The full handshake is specified in [PROTOCOL.md — Peer Protocol](PROTOCOL.md#peer-protocol-member--member).

---

## Multiple Entities per Person

A single member may run multiple HMAN *entities* at once:

- **Personal entity** — your banking, your contacts, your health
- **Trade entity** — your ABN, GST rate, invoice rail
- **Creative entity** — for a band, project, or LLC you operate
- **Household entity** — for shared expenses with a partner or flatmates

Each entity:

- Has its own signing key and nominated payment rail
- Holds a scoped subset of vaults
- Can be disabled or deleted without affecting others
- Appears as a distinct counterparty in the Peer Protocol

At the cafe you might settle via your **Personal** entity. Invoicing a client at a co-working space, via your **Trade** entity. Each is *you* — at a different layer of life.

Specified in [PROTOCOL.md — Multi-Entity Model](PROTOCOL.md#multi-entity-model).

---

## Biometric Channels

.HMAN binds to the member through biometric channels. Today:

- **Voice** — Resemblyzer-based speaker verification, Fernet-encrypted reference at rest. Shipping.

On the roadmap:

- **Heart-rate variability (HRV)** — via Apple Watch, Polar, Garmin (HealthKit, ANT+, BLE HR profile)
- **Electrocardiogram (ECG)** — short-form identity verification; already a proven biometric in the wearables market
- **Electroencephalography (EEG)** — via Muse S Athena. Dual purpose: (a) biometric potential, (b) cognitive-load signal feeding the receptivity gate (don't interrupt me when I'm focused)
- **Proximity fusion** — AirPods Pro + Watch co-presence as a second factor

No single channel is sufficient on its own. Biometric *fusion* — not single-channel biometrics — is the target. Compromise of one channel must not grant access on its own.

---

## How Requests Reach You

Once a counterparty (an AI, another HMAN, a business) sends a request, your HMAN decides *whether and how* to surface it. The default is silence until you've opted in.

Three trust levels govern this (see [PROTOCOL.md — Relay Protocol](PROTOCOL.md#relay-protocol-ai--member)):

1. **Manual** — every request requires your conscious approval. Zero automation. Default for all new members.
2. **Connected** — you've linked specific services; requests still require a Y/N, but fulfilment is automatic when you approve.
3. **Pre-Approved** — you've set rules (e.g. "Claude can read my calendar, not write it"). Matching requests auto-approve, non-matching ones fall back to Manual.

At every level you can revoke, export, delete. There is no "locked in" state. Signal remains one valid transport for these requests, alongside the web dashboard and direct MCP integration.

---

## The Shift

.HMAN is not another assistant. It is a category change: the human finally has their own memory layer, their own consent layer, their own negotiating counterparty in an AI-mediated world.

Free. Open source. MIT. Yours.

---

*Your subconscious. Local. Encrypted. Yours.*
