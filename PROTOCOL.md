# .HMAN Protocol

.HMAN defines two complementary protocols:

- **[Relay Protocol](#relay-protocol-ai--member)** — AI ↔ Member. How an external AI (Claude, GPT, Gemini, ...) requests data or actions from you, gated by your consent.
- **[Peer Protocol](#peer-protocol-member--member)** — Member ↔ Member. How two HMANs negotiate directly on behalf of their members (the cafe scenario).

Both are joined by three cross-cutting specifications:

- **[Multi-Entity Model](#multi-entity-model)** — how one member runs multiple entities (Personal, Trade, Household, ...) with independent keys and rails.
- **[Payment Rail Adapters](#payment-rail-adapters)** — the pluggable interface for PayID, OSKO/NPP, BPay, Stripe, ...
- **[Receptivity Channels](#receptivity-channels)** — how a signal reaches the member (silent / ambient / whisper / haptic / confirm / interrupt), enforcing Gate #4.

---

## Relay Protocol: AI ↔ Member

### Overview

.HMAN is a **relay** between AI and your data. Nothing happens without your approval. You start with maximum control and can unlock automation as you build trust.

---

### Trust Levels

#### Level 1: Manual (Default)
**All users start here.**

```
AI: "I want your calendar"
You: "Y"
.HMAN: "What would you like to share?"
You: [paste the specific events]
.HMAN: [relays to AI]
```

- You provide data on-demand
- Maximum control
- Higher latency (you're in the loop)
- .HMAN sees nothing until you share it

#### Level 2: Connected
**Unlock after building trust.**

```
AI: "I want your calendar"
You: "Y"
.HMAN: [auto-fetches from your connected Google Calendar]
.HMAN: [relays to AI]
```

- OAuth connections to your services
- Still requires approval per request
- Lower latency (automatic after Y)
- You can revoke connections anytime

#### Level 3: Pre-Approved
**For trusted AI + trusted data types.**

```
AI: "I want your calendar"
.HMAN: [auto-approves based on your rules]
.HMAN: [fetches and relays]
You: [notified after the fact]
```

- Set rules: "Claude can always read (not write) my calendar"
- Near-instant for approved combinations
- Full audit trail
- Revoke rules anytime

---

### How Trust Progresses

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   START                                                                 │
│     │                                                                   │
│     ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │ LEVEL 1: MANUAL                                                 │   │
│   │                                                                 │   │
│   │ • All requests require approval                                 │   │
│   │ • You paste/type data manually                                  │   │
│   │ • .HMAN stores nothing                                          │   │
│   │ • Send "connect" when ready to upgrade                          │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│     │                                                                   │
│     │ After you've used .HMAN a few times and trust it                 │
│     ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │ LEVEL 2: CONNECTED                                              │   │
│   │                                                                 │   │
│   │ • Link services (Google, Microsoft, etc.)                       │   │
│   │ • Still approve each request                                    │   │
│   │ • .HMAN fetches automatically when you say Y                   │   │
│   │ • Send "rules" when ready to upgrade                            │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│     │                                                                   │
│     │ After you trust specific AI + data combinations                   │
│     ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │ LEVEL 3: PRE-APPROVED                                           │   │
│   │                                                                 │   │
│   │ • Set rules: "Claude can read calendar"                         │   │
│   │ • Auto-approve matching requests                                │   │
│   │ • Notified after the fact                                       │   │
│   │ • Full audit log                                                │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Commands by Trust Level

#### Level 1 (Manual)
| Command | Description |
|---------|-------------|
| `start` | Initialize .HMAN |
| `code` | Generate session code |
| `Y` / `N` | Approve / deny request |
| `status` | View active sessions |
| `revoke` | End all sessions |
| `help` | Show commands |

#### Level 2 (Connected)
| Command | Description |
|---------|-------------|
| `connect` | Start OAuth flow to link a service |
| `disconnect` | Remove a connected service |
| `connections` | List connected services |

#### Level 3 (Pre-Approved)
| Command | Description |
|---------|-------------|
| `rules` | View current auto-approve rules |
| `allow <AI> <action> <data>` | Add a rule |
| `deny <AI>` | Remove AI from pre-approved |
| `audit` | View what was auto-approved |

---

### Data Flow by Level

#### Level 1: Manual
```
AI ─────► .HMAN ─────► Signal ─────► YOU
                                      │
                                      │ (you type/paste data)
                                      ▼
AI ◄───── .HMAN ◄───── Signal ◄───── YOU
```

#### Level 2: Connected
```
AI ─────► .HMAN ─────► Signal ─────► YOU
                 │                    │
                 │                    │ "Y"
                 ▼                    ▼
            Your Services ◄──────── .HMAN
            (Google, etc.)
                 │
                 ▼
AI ◄───── .HMAN ◄─────────────────────
```

#### Level 3: Pre-Approved
```
AI ─────► .HMAN ─────► Your Services
             │                │
             │                ▼
             │           [auto-fetch]
             │                │
             ├────────────────┘
             │
             ▼
AI ◄───── .HMAN ─────► Signal ─────► YOU (notification)
```

---

### Session Codes

| Property | Value |
|----------|-------|
| Length | 6 characters |
| Characters | A-Z, 2-9 (no I, O, 0, 1) |
| Expiry | 5 minutes |
| Usage | Single-use |

---

### Security Guarantees

| Level | .HMAN Sees | .HMAN Stores |
|-------|-----------|--------------|
| 1 (Manual) | Only what you paste | Nothing |
| 2 (Connected) | Data as it passes through | OAuth tokens only |
| 3 (Pre-Approved) | Data as it passes through | OAuth tokens + rules |

**At ALL levels:**
- You can revoke at any time
- Full audit trail (on your side)
- Session-based, temporary access
- End-to-end encrypted via Signal

---

### Pull the Plug

At any level, send **"revoke"** to immediately:
- End all active sessions
- Disconnect all AIs
- Cancel all in-flight requests

OAuth connections remain (you control those separately via `disconnect`).

---

### API for AI Developers

#### Link Session
```
POST /api/link
{ "code": "X7K3PQ", "service": "Claude" }
```

#### Request Data
```
POST /api/request
{
  "session_id": "sess_123",
  "type": "calendar",
  "purpose": "Project planning",
  "read_only": true
}
```

#### Check Response
```
GET /api/request/:id
→ { "status": "approved", "data": {...} }
→ { "status": "denied", "reason": "User declined" }
→ { "status": "pending" }
```

---

## Peer Protocol: Member ↔ Member

When two members with HMANs interact — in person, on a call, or at an online checkout — their HMANs negotiate on their behalf. This is the "cafe scenario" (see [VISION.md — Canonical Scenario](VISION.md#canonical-scenario-two-hmans-at-a-cafe)).

### Design Goals

- No app download, no scan-to-pay friction.
- Both sides retain full audit.
- Both sides retain payment-rail choice.
- Human-in-the-loop for anything not pre-approved.
- Works offline on local network (BLE / mDNS / Wi-Fi Aware); online via relay fallback.

### Identity

Every HMAN has a stable identity key (Ed25519). Entities under an HMAN derive sub-keys (see [Multi-Entity Model](#multi-entity-model)).

Discovery presents a signed advertisement:

```json
{
  "hman_id": "<hex(pubkey)>",
  "entity_id": "<entity-uuid>",
  "display_name": "Cafe on Oxford",
  "payment_rails_advertised": ["payid", "osko", "stripe"],
  "receptivity_policy_hash": "<sha256 of policy blob>",
  "signed_at": "<iso8601>",
  "sig": "<ed25519 sig over the above fields>"
}
```

### Handshake

```
1. Discover     A advertises presence (BLE / mDNS / Wi-Fi Aware), or is given
                B's hman_id explicitly (QR, NFC, out-of-band).

2. Hello        A → B: { hman_id_A, entity_id_A, nonce_A, capabilities, sig_A }
                B → A: { hman_id_B, entity_id_B, nonce_B, capabilities, sig_B }

3. Verify       Both sides verify signatures against advertised identity keys.
                Optionally consult PACT authenticity chain for first-time peers.

4. Offer        Either side sends OFFER:
                {
                  offer_id, from_entity, to_entity,
                  items:  [{ description, qty, price }],
                  total:  { amount, currency },
                  rail_preference: ["payid", "osko", ...],
                  receptivity_hint:
                    "silent" | "ambient" | "whisper" | "haptic" |
                    "confirm" | "interrupt",
                  expires_at,
                  sig
                }

5. Ack/Counter  Recipient responds with ACK, COUNTER-OFFER, or DECLINE.
                Each response is signed with the responding entity's key.

6. Commit       Accepting party sends COMMIT referencing the final offer_id.
                The paying party now initiates settlement via the chosen
                PaymentRailAdapter.

7. Settle       Rail adapter fires settlement. Both HMANs receive a
                SettlementProof (rail-specific format).

8. Audit        Both HMANs append hash-chained entries to the relevant
                entity audit stream (~/.hman/entities/<id>/audit.jsonl).
```

### Failure / Cancellation

- OFFER expires if not ACKed by `expires_at` (default 60s for in-person).
- COMMIT can be revoked up until the rail adapter initiates transmission.
- Settlement failure triggers a COMPENSATE flow (automatic refund or retry, per rail policy).
- Any party can drop the session — the other HMAN receives a signed DROP event and appends it to audit.

### Consent

Every COMMIT requires either:

- A pre-approved rule match (Relay Protocol Trust Level 3 semantics — the member has previously authorised this counterparty + amount band + entity combination), **or**
- A live consent event — voice-bound per Gate #5 (push-to-talk confirmation, or wake-phrase plus voice verification).

A COMMIT without one of these is rejected at the bridge, before reaching any rail adapter.

---

## Multi-Entity Model

A member can operate multiple entities. Each entity is a distinct counterparty in the Peer Protocol and a distinct scope in the Relay Protocol.

### Structure

```
Member (root identity, biometrically bound)
├── Entity: "Personal"
│   ├── sub-key (Ed25519)
│   ├── nominated_rails: ["payid:+61...", "card:stripe_cus_..."]
│   ├── vault_scope: ["calendar", "contacts", "health"]
│   └── audit_stream: entities/personal/audit.jsonl
│
├── Entity: "Trade"
│   ├── sub-key
│   ├── nominated_rails: ["osko:bsb+account", "bpay:biller_code"]
│   ├── vault_scope: ["invoices", "abn", "business_calendar"]
│   ├── tax_profile: { gst_registered: true, rate: 0.10 }
│   └── audit_stream: entities/trade/audit.jsonl
│
└── Entity: "Household"
    └── ...
```

### Rules

- All entities share one root identity. You are still *you*.
- An entity can be enabled, disabled, or deleted independently; doing so does not affect others.
- An entity's vault scope is enforced at the access-gate level — a compromise of one entity's keys cannot read another's vaults.
- Payment-rail nominations are per-entity. A COMMIT in the Peer Protocol settles on the *committing entity's* nominated rail, not the member's default.
- The member chooses which entity is active for a given interaction, either explicitly (via dashboard / voice) or by policy (e.g. business-hours + in-office = Trade; otherwise Personal).

### Data Model (proposed — Phase 2)

```ts
type Entity = {
  id: string;                    // UUID
  member_id: string;             // root member
  display_name: string;
  created_at: string;            // ISO 8601
  key_pub: Uint8Array;           // Ed25519 public key
  key_priv_ref: VaultRef;        // encrypted, stored in root vault
  nominated_rails: PaymentRailNomination[];
  vault_scope: VaultScope;
  receptivity_policy: ReceptivityPolicy;
  status: "active" | "suspended" | "archived";
};
```

Storage layout proposal: `~/.hman/entities/<uuid>/{config.json, audit.jsonl, vaults/}`. Root identity material and the encrypted `key_priv_ref` for each entity live in the root vault at `~/.hman/identity/`.

---

## Payment Rail Adapters

Every HMAN nominates one or more payment rails per entity. A rail is a pluggable adapter implementing a common interface.

### Adapter Interface

```ts
interface PaymentRailAdapter {
  readonly id: string;             // e.g. "payid", "osko", "stripe", "bpay"
  readonly currencies: string[];   // ISO 4217

  /** Human-readable description of what this rail needs to settle. */
  describe(nomination: RailNomination): RailDescription;

  /**
   * Initiate settlement. Returns a receipt stream so UIs and audit can
   * tail rail-specific events (e.g. "awaiting_bank_confirmation").
   * MUST be idempotent on (offer_id, commit_id).
   */
  settle(intent: SettlementIntent): AsyncIterable<SettlementEvent>;

  /** Verify a settlement proof received from a counterparty. */
  verifyProof(proof: SettlementProof): VerifyResult;
}

type SettlementIntent = {
  offer_id: string;
  commit_id: string;
  from_entity: EntityId;
  to_entity: EntityId;
  amount: { value: string; currency: string };
  rail_nomination: RailNomination;   // advertised by counterparty's entity
  idempotency_key: string;           // sha256(offer_id|commit_id)
};
```

### Shipping Order (Phase 3)

1. **PayID** — Australian NPP overlay. Alias (phone / email / ABN) → BSB + account resolution. OSKO-backed near-real-time settlement.
2. **Stripe** — card / Apple Pay / Google Pay fallback. For online counterparties and non-PayID users.
3. **OSKO / NPP direct** — BSB + account, same-day settlement.
4. **BPay** — biller-code based, for business-to-individual bill scenarios.

Non-goals (explicitly): stablecoin / on-chain rails. .HMAN stays TradFi until the banking layer has a compelling reason to change — a scope position, not a religious one.

### Rail Selection

During Peer Protocol handshake, both sides advertise their rail nominations. The paying side selects the intersection that optimises for:

1. Lowest fee to payer
2. Fastest settlement (near-real-time preferred)
3. Highest historical counterparty confirmation rate

If no intersection exists, the session falls back to a manual off-protocol rail (e.g. cash) and records the intent plus the fallback reason in audit. The cash fallback is a recorded event, not an unstructured absence of data.

### Keys and Secrets

Rail credentials (Stripe API key, PayID registration token, BPay customer reference, etc.) live in the entity vault, never in the bridge process memory for longer than the settlement window. Adapter instances are short-lived per-settlement.

---

## Receptivity Channels

When an HMAN receives a signal — an incoming OFFER, a pre-approved payment completing, a biometric alert — *how* it reaches the member is itself a gated decision.

This section is the enforcement layer for **Gate #4 (Reactive & Non-Invasive)** at the P2P protocol level. It resolves issue #4 (channel-aware receptivity gate).

### Channels

| Channel | Disturbance | Use case |
|---|---|---|
| **Silent** | None — append to audit, no surface | Pre-approved rule matched; no human decision needed |
| **Ambient** | Indirect — status light, dashboard only | Informational; the member checks when they want |
| **Whisper** | Audible only to member (bone-conduction, earbud) | Low-urgency decision ("offer received, 30s to respond") |
| **Haptic** | Wearable tap | Same urgency as whisper, for quiet contexts (meetings, libraries) |
| **Confirm** | Voice-bound prompt requiring a member utterance | Any COMMIT that isn't pre-approved |
| **Interrupt** | Audible + haptic simultaneously | Safety / security events only — fraud signal, biometric mismatch, health alert |

### Policy Structure

Each entity carries a receptivity policy:

```ts
type ReceptivityPolicy = {
  default_channel: ReceptivityChannel;
  rules: Array<{
    condition: ReceptivityCondition;   // e.g. "offer.total < $50", "counterparty in trust_list"
    channel: ReceptivityChannel;
    rationale?: string;                // for audit
  }>;
  cognitive_load_override?: {
    signal_source: "eeg" | "hrv" | "fusion";
    high_load_channel: ReceptivityChannel;   // downgrade target when focused
    threshold: number;                        // source-specific
  };
};
```

### Constraints

- **Disturbance is monotonic downward only.** A rule saying "always interrupt me for offers over $10,000" is valid. A rule saying "suppress interrupts for security events" is not. The protocol enforces this at policy-parse time.
- **Cognitive-load-informed downgrade** requires a signed biometric stream (EEG, HRV). This ties into issue #3 (Muse Athena rc:69 handshake fix) and the biometric roadmap in [VISION.md — Biometric Channels](VISION.md#biometric-channels).
- **Policy changes require biometric re-auth** (voice plus a second factor when available). A silent policy override must not itself be silent.

### Relation to the Peer Protocol

Every OFFER carries a `receptivity_hint` from the sender. It is advisory, not binding.

The receiving HMAN evaluates its own policy and may *downgrade* the disturbance (e.g. sender hint "confirm" → receiver policy "whisper" because the counterparty is in the trust list). The receiving HMAN must **not** upgrade past the sender's hint.

This prevents unsolicited "urgent!" offers from abusing the interrupt channel while still letting the member's own policy silence low-value noise.

### Future: Cognitive-Load Gating

Once a stable EEG or HRV stream is available (issue #3 resolved for Muse S Athena, plus the wearable channels in [VISION.md — Biometric Channels](VISION.md#biometric-channels)), the receptivity gate can consume a cognitive-load signal to pre-emptively downgrade. Example policy:

> "When HRV indicates high focus AND I'm in a calendar-marked focus block, downgrade all non-security signals to Silent + dashboard."

This keeps Gate #4 intact under load: the member isn't interrupted, the signal isn't lost.

---

*Start with control. Unlock speed as you build trust.*
