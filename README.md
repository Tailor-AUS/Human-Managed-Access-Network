# Human Managed Access Network (HMAN)

> **Your data. Your rules. Any AI.**

HMAN is your **personal data representative** — an LLM-agnostic layer that ensures every AI must ask **you** before accessing **your** data or acting on **your** behalf.

📖 **[Read the full Vision →](./VISION.md)**

---

## The Core Idea

```
                              YOU
                               │
                               │ 100% Control
                               ▼
                    ┌─────────────────────┐
                    │                     │
                    │        HMAN         │
                    │   Your Digital      │
                    │   Representative    │
                    │                     │
                    └──────────┬──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
     ┌──────────┐       ┌──────────┐       ┌──────────┐
     │  Claude  │       │  Gemini  │       │  GPT-X   │     Any AI
     │ Anthropic│       │  Google  │       │  OpenAI  │
     └──────────┘       └──────────┘       └──────────┘
```

## Why HMAN?

| Without HMAN | With HMAN |
|--------------|-----------|
| AI has your data | **You** have your data |
| AI decides what to access | **You** decide what to share |
| Different rules per AI | **One place** to control all |
| Vendor lock-in | **LLM agnostic** — switch freely |
| Trust the AI company | **Trust yourself** |

## Core Principles

| Principle | Description |
|-----------|-------------|
| 🔐 **Human In The Loop** | Every AI access request requires your explicit approval |
| 🤖 **LLM Agnostic** | Works with Claude, GPT, Gemini, Llama, or any future AI |
| 📱 **Signal-First** | Control everything via secure Signal messages |
| ⚡ **Task Execution** | AIs can act on your behalf — with your approval |
| 🛡️ **Zero Knowledge** | HMAN is a broker, not a vault — your data stays yours |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           HMAN PLATFORM                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│    ┌─────────────┐       ┌──────────────────┐       ┌──────────────────┐   │
│    │   Claude    │       │                  │       │                  │   │
│    │   Gemini    │◀─────▶│   HMAN Service   │◀─────▶│   User's Phone   │   │
│    │   GPT-4     │  MCP  │                  │Signal │   📱             │   │
│    │   etc.      │       └────────┬─────────┘       └──────────────────┘   │
│    └─────────────┘                │                                        │
│                                   │                                        │
│                          ┌────────▼────────┐       ┌──────────────────┐   │
│                          │  Task Executor  │       │  User's Data     │   │
│                          │  • Payments     │       │  (Note to Self)  │   │
│                          │  • Bookings     │       │  • Encrypted     │   │
│                          │  • Actions      │       │  • User-owned    │   │
│                          └─────────────────┘       └──────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Data Flow:**
1. AI requests access/action via MCP
2. HMAN forwards to user via Signal: *"Claude wants your calendar. Y/N?"*
3. User replies in Signal: *"Y"* or *"N"*
4. HMAN executes (if approved) and confirms

## Permission Levels

| Level | Name | Behaviour | Example Data |
|-------|------|-----------|--------------|
| 🟢 | **Open** | Auto-shared with any connected AI | Display name, language |
| 🟡 | **Standard** | Shared with logging; user notified | Calendar, general notes |
| 🟠 | **Gated** | Requires approval each time | Financial, health records |
| 🔴 | **Locked** | Never shared; manual only | Passwords, private keys |

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+

### Installation

```bash
# Clone the repository
git clone https://github.com/Tailor-AUS/Human-Managed-Access-Network.git
cd Human-Managed-Access-Network

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Run the Demo

```bash
# Run the interactive demo (creates .hman file)
pnpm dev:demo
```

This demonstrates:
- Encrypted vault creation
- Tiered permission levels
- Access control with human-in-the-loop
- Audit logging with integrity verification

### Signal-First Interface (Recommended)

HMAN is designed to be controlled entirely via Signal messaging - no web dashboard needed!

```bash
# Set up Signal (requires signal-cli + Java 21)
pnpm --filter @hman/demo-cli signal

# Run Signal-first interface
pnpm --filter @hman/demo-cli signal:first
```

Once running, control HMAN by sending messages to yourself:
- **STATUS** - Check vault status
- **VAULTS** - List your vaults
- **PENDING** - See access requests
- **APPROVE** / **DENY** - Respond to AI requests
- **HELP** - All available commands

### Run the MCP Server

```bash
# Start HMAN Gate (MCP server)
pnpm dev:mcp
```

Then configure your MCP client (e.g., Claude Desktop) to connect to the HMAN Gate.

## Project Structure

```
├── packages/
│   ├── shared/          # Shared types and utilities
│   ├── core/            # Core SDK (encryption, vaults, access control)
│   └── mcp-server/      # HMAN Gate MCP server
├── apps/
│   └── demo-cli/        # Demo CLI application
└── README.md
```

## Packages

### @hman/shared

Shared TypeScript types for the HMAN platform:
- Permission types and levels
- Vault and item schemas
- Access request/response types
- Audit log types
- MCP resource and tool definitions

### @hman/core

Core SDK providing:
- **Encryption** (libsodium): XChaCha20-Poly1305, Argon2id key derivation
- **Key Management**: Master key → Vault keys → Item keys hierarchy
- **Vault Manager**: Encrypted data compartments with tiered permissions
- **Audit Logger**: Integrity-verified local audit trail
- **Access Gate**: HITL enforcement point for all AI access

### @hman/mcp-server

HMAN Gate - the MCP server that mediates AI access:
- Implements Model Context Protocol
- Exposes resources based on permission levels
- Enforces gated access with user approval
- Logs all access to the audit trail

## MCP Resources

HMAN exposes the following resources via MCP:

```
hman://identity/profile          → Level 0 (Open)
hman://calendar/events           → Level 1 (Standard)
hman://diary/entries             → Level 1 (Standard)
hman://finance/transactions      → Level 2 (Gated)
hman://finance/bills             → Level 2 (Gated)
hman://health/records            → Level 2 (Gated)
hman://secrets/passwords         → Level 3 (Locked - never exposed)
```

## MCP Tools

Available tools for AI models:

| Tool | Description | Permission Level |
|------|-------------|-----------------|
| `approve_payment` | Request user approval for a PayID payment | Gated |
| `create_delegation` | Delegate access to another HMAN user | Gated |
| `schedule_event` | Add a calendar event | Standard |
| `add_diary_entry` | Add a diary entry | Standard |
| `query_audit_log` | Query the access audit log | Standard |

## Key Hierarchy

```
User Passphrase + Device Key
        │
        ▼ (Argon2id)
   Master Key
        │
        ├──► Vault Key (Finance)     ──► Item Keys
        ├──► Vault Key (Health)      ──► Item Keys
        ├──► Vault Key (Identity)    ──► Item Keys
        ├──► Vault Key (Diary)       ──► Item Keys
        └──► Delegation Keys         ──► Scoped, time-bound
```

## Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Encryption** | libsodium (XChaCha20-Poly1305) | Modern, audited, fast |
| **Key Derivation** | Argon2id | Memory-hard, resists GPU attacks |
| **MCP Server** | TypeScript | Official MCP SDK |
| **Type Safety** | TypeScript + Zod | Runtime validation |
| **Package Manager** | pnpm | Fast, efficient workspaces |

## Development Roadmap

### Phase 1: Core HMAN ✅
- [x] Monorepo setup
- [x] Shared types package
- [x] Core SDK (encryption, vaults, access control)
- [x] HMAN Gate MCP server
- [x] Demo CLI
- [ ] iOS app (React Native)

### Phase 2: Messaging + Sync
- [ ] E2EE messaging (human-to-human)
- [ ] Bot framework (structured messages)
- [ ] Multi-device encrypted sync
- [ ] Android app

### Phase 3: Payments + Delegation
- [ ] PayID integration
- [ ] Delegation system
- [ ] Payment approval flow

### Phase 4: Corporate + Hardening
- [ ] Team vaults with RBAC
- [ ] Admin controls
- [ ] Security audit
- [ ] Open-source core release

## Contributing

HMAN is designed to be a non-profit, community-driven project. Contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `pnpm test`
5. Submit a pull request

## Security

HMAN uses a zero-access architecture:
- All data is encrypted client-side before storage
- Encryption keys never leave the user's device
- The server only sees encrypted blobs
- Even under legal compulsion, operators cannot decrypt user data

For security concerns, please email security@hman.network (once established).

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Human Managed Access Network** — Because your data should be *yours*.
