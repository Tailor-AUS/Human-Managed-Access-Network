# HMAN Vision

## Your Personal Data Representative

**HMAN (Human Managed Access Network) is your digital representative that ensures ANY AI, from ANY company, must ask YOU before accessing YOUR data or acting on YOUR behalf.**

---

## The Problem

In the current AI landscape:

- 🔴 **AI has your data** — You upload documents, chat histories, emails to AI services
- 🔴 **AI decides access** — Each AI platform has its own rules about what it can see
- 🔴 **Vendor lock-in** — Your data is scattered across Claude, ChatGPT, Gemini, etc.
- 🔴 **No unified control** — Different privacy settings for each service
- 🔴 **Trust the company** — You hope they handle your data correctly

## The HMAN Solution

```
                              YOU
                               │
                               │ 100% Control
                               ▼
                    ┌─────────────────────┐
                    │                     │
                    │        HMAN         │
                    │                     │
                    │   Your Digital      │
                    │   Representative    │
                    │                     │
                    └──────────┬──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
     ┌──────────┐       ┌──────────┐       ┌──────────┐
     │  Claude  │       │  Gemini  │       │  GPT-X   │       ...
     │ Anthropic│       │  Google  │       │  OpenAI  │       Any AI
     └──────────┘       └──────────┘       └──────────┘
```

- 🟢 **You have your data** — Stored encrypted, under your control
- 🟢 **You decide access** — Every request requires your approval
- 🟢 **LLM agnostic** — Works with any AI, switch freely
- 🟢 **One place to control all** — Single interface for all AI permissions
- 🟢 **Trust yourself** — You see every request, every decision

---

## Core Principles

### 1. Human In The Loop — Always

No AI can access your data or act on your behalf without your explicit approval. Not sometimes. **Always.**

```
AI Request → HMAN → You (approve/deny) → Action
```

### 2. LLM Agnostic

HMAN doesn't care which AI is asking. Claude, Gemini, GPT, Llama, or the next big model — they all go through HMAN. You're not locked into any vendor.

### 3. Zero Knowledge Architecture

HMAN is a **broker**, not a vault. Your data stays in your control:

| Data | Where It Lives | Who Controls It |
|------|---------------|-----------------|
| Your personal data | Your encrypted storage | You |
| Your credentials | Your device | You |
| Request routing | HMAN service | HMAN (minimal) |
| What you shared | Audit log (transparent) | You can see everything |

### 4. Signal-First Communication

All AI requests come through Signal — the most secure messaging protocol:

- 🔐 End-to-end encrypted
- 📱 Works on your phone
- 💬 Natural conversation: "Claude wants your calendar. Y/N?"
- ✅ Simple approval: Just reply "Y" or "N"

### 5. Task Execution with Consent

AIs don't just read — they can **do** things on your behalf. But only with your approval:

```
Claude: "Pay $145 electricity bill?"
You: "Y"
HMAN: *executes payment*
You: "✅ Paid! Confirmation #12345"
```

---

## How It Works

### For Users

1. **Add HMAN to Signal** — Like adding a friend
2. **Connect your AIs** — Claude, Gemini, etc. connect via MCP
3. **Receive requests** — "Claude wants your calendar for scheduling"
4. **Reply Y or N** — That's it
5. **Stay in control** — Every access logged, every action confirmed

### For AI Developers

1. **Connect via MCP** — Standard Model Context Protocol
2. **Request access** — `hman.requestAccess({ resource: 'calendar', purpose: '...' })`
3. **Wait for approval** — HMAN asks the human
4. **Receive data or denial** — Respect the human's decision
5. **Execute tasks** — With human approval for each action

---

## Permission Levels

| Level | Description | Example |
|-------|-------------|---------|
| 🟢 **Open** | Auto-approved, AI can access freely | Public profile info |
| 🟡 **Standard** | Approved once, remembered | Calendar read access |
| 🟠 **Gated** | Requires approval each time | Financial data |
| 🔴 **Locked** | Never shared automatically | Medical records, passwords |

---

## The Vision

### Today
```
User → uploads data to → AI Platform → AI has control
```

### With HMAN
```
User ← controls data via ← HMAN ← requests from ← Any AI
```

### The Future

- Every person has an HMAN
- Every AI asks HMAN before accessing personal data
- Humans stay in control of the AI age
- Data sovereignty is the default, not the exception

---

## Tagline

> **Your data. Your rules. Any AI.**

---

## Get Started

```bash
# Clone HMAN
git clone https://github.com/your-org/Human-Managed-Access-Network

# Install
pnpm install

# Link Signal
signal-cli link -n "HMAN"

# You're in control
```

---

*HMAN: Because your digital life should be yours to control.*
