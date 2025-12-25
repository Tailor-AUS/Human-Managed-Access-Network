# Human Managed Access Network (HMAN)

**Privacy-first platform for sovereign control over your digital context.**

HMAN is a non-profit platform that gives users complete control over their digital data. Built on Anthropic's [Model Context Protocol (MCP)](https://modelcontextprotocol.io/), HMAN acts as the secure bridge between your encrypted data vaults and connected AI systems—ensuring that **humans always remain in control** of what AI can see and do.

## Core Principles

| Principle | Implementation |
|-----------|----------------|
| **Human-managed** | Every AI access request requires explicit human approval (or pre-configured delegation) |
| **Access-controlled** | Tiered permissions with cryptographic enforcement—not policy promises |
| **Networked** | Connect to any MCP-compatible AI, plus E2EE messaging with humans and bots |
| **Zero-access architecture** | Operators cannot decrypt user data, even under legal compulsion |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      HMAN Client (Device)                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │   Vaults     │   │  HMAN Gate   │   │  E2EE Messaging │  │
│  │  (Encrypted) │◄──┤  (MCP Server)│   │  (Signal Proto) │  │
│  └──────────────┘   └──────┬───────┘   └───────┬────────┘  │
│                            │                    │           │
│         ┌──────────────────┼────────────────────┤           │
│         │                  │                    │           │
│         ▼                  ▼                    ▼           │
│  ┌─────────────┐   ┌─────────────┐      ┌─────────────┐    │
│  │ HITL Control│   │ Delegation  │      │ Audit Log   │    │
│  │   Engine    │   │   Manager   │      │  (Local)    │    │
│  └─────────────┘   └─────────────┘      └─────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │ MCP                              │ E2EE
         ▼                                  ▼
  ┌─────────────────┐               ┌─────────────────┐
  │ Claude / Grok   │               │ Utility Bots    │
  │ GPT / Llama     │               │ Payment Requests│
  └─────────────────┘               └─────────────────┘
```

## Permission Levels (The "Gate" System)

| Level | Name | Behaviour | Example Data |
|-------|------|-----------|--------------|
| 0 | **Open** | Auto-shared with any connected AI | Display name, language preference |
| 1 | **Standard** | Shared with logging; user notified post-hoc | Calendar, general notes |
| 2 | **Gated** | Requires tap-to-approve; push notification | Financial transactions, health records |
| 3 | **Locked** | Never shared via MCP; manual copy only | Passwords, private keys, legal documents |

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
# Run the interactive demo
pnpm dev:demo
```

This demonstrates:
- Encrypted vault creation
- Tiered permission levels
- Access control with human-in-the-loop
- Audit logging with integrity verification

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
