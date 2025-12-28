# .HMAN Architecture

> **Connect AI to your life. You stay in control.**

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   USER (Signal App)                                                      │
│   ├── Send "code" → get X7K3PQ                                          │
│   ├── Receive requests from AI                                           │
│   └── Reply Y/N or A/B/C                                                 │
│                                                                          │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   SIGNAL CLIENT (packages/core/src/signal/)                              │
│   ├── Session code generation (6 chars, 5 min expiry)                    │
│   ├── Commands: start, code, status, revoke, help                        │
│   ├── Message send/receive via signal-cli                                │
│   └── Pending request management with timeout                            │
│                                                                          │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   BRIDGE (packages/core/src/bridge.ts)                                   │
│   ├── Session linking (code → session)                                   │
│   ├── Data request approval                                              │
│   ├── Payment request approval (card/BSB/PayID)                          │
│   └── Action request approval                                            │
│                                                                          │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   MCP SERVER (packages/mcp-server/)                                      │
│   ├── Claude Desktop integration                                         │
│   ├── Tools: approve_payment, schedule_event, search_vaults, etc.        │
│   ├── Resources: hman://calendar, hman://contacts, etc.                  │
│   └── Permission levels (Standard, Gated, Locked)                        │
│                                                                          │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   AI (Claude, GPT, Gemini, etc.)                                         │
│   ├── Links with session code                                            │
│   ├── Requests data/actions via MCP                                      │
│   └── Receives approved data or denial                                   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## The Flow

### 1. User Generates Session Code

```
User on Signal          Signal Client
      │                      │
      │ "code"               │
      │─────────────────────►│
      │                      │ Generate: X7K3PQ
      │                      │ Store: {code, phone, expiry}
      │ "X7K3PQ (5 min)"     │
      │◄─────────────────────│
```

### 2. AI Links with Code

```
AI                       Bridge                    Signal Client
│                          │                            │
│ link("X7K3PQ", "Claude") │                            │
│─────────────────────────►│ linkSession(code)          │
│                          │───────────────────────────►│
│                          │                            │ Validate code
│                          │                            │ Create session
│                          │ Session { id, phone, ... } │
│                          │◄───────────────────────────│
│ Session                  │                            │
│◄─────────────────────────│                            │
│                          │                            │
│                          │ Notify user via Signal     │
│                          │───────────────────────────►│ "Claude connected"
```

### 3. AI Requests Data

```
AI                       Bridge                    Signal Client        User
│                          │                            │               │
│ requestDataApproval()    │                            │               │
│─────────────────────────►│ requestApproval()          │               │
│                          │───────────────────────────►│    msg        │
│                          │                            │──────────────►│
│                          │                            │               │
│                          │                            │    "Y"        │
│                          │                            │◄──────────────│
│                          │ response                   │               │
│                          │◄───────────────────────────│               │
│ {approved: true}         │                            │               │
│◄─────────────────────────│                            │               │
```

---

## Project Structure

```
.hman/
├── apps/
│   └── web-dashboard/
│       └── public/
│           └── index.html        # Landing page
│
├── packages/
│   ├── core/
│   │   └── src/
│   │       ├── signal/           # Signal client
│   │       │   ├── client.ts     # Session codes, messaging
│   │       │   └── index.ts
│   │       ├── bridge.ts         # AI ↔ Signal bridge
│   │       ├── vault/            # Encrypted data storage
│   │       ├── crypto/           # Encryption
│   │       ├── access/           # Permission management
│   │       ├── audit/            # Audit logging
│   │       └── index.ts
│   │
│   ├── mcp-server/
│   │   └── src/
│   │       ├── server.ts         # MCP implementation
│   │       ├── cli.ts            # CLI entry point
│   │       └── index.ts
│   │
│   └── shared/
│       └── src/
│           └── types/            # Shared types
│
├── README.md
├── VISION.md
├── PROTOCOL.md
└── ARCHITECTURE.md               # This file
```

---

## Key Components

### Signal Client

```typescript
import { createSignalClient } from '@hman/core';

const client = createSignalClient({
  phoneNumber: '+61400000000',
});

await client.start();

// Handle incoming message
const response = await client.handleIncomingMessage(
  '+61412345678',
  'code'
);
// → "Your session code: X7K3PQ (valid 5 minutes)"
```

### Bridge

```typescript
import { createBridge } from '@hman/core';

const bridge = createBridge({
  phoneNumber: '+61400000000',
});

await bridge.start();

// Link AI session
const session = await bridge.link('X7K3PQ', 'Claude');

// Request data approval
const result = await bridge.requestDataApproval({
  resource: 'calendar',
  purpose: 'Project planning',
});

if (result.approved) {
  // User approved, return calendar data
}
```

### MCP Server

```typescript
import { createHmanGate } from '@hman/mcp-server';

const gate = createHmanGate({
  onAccessRequest: async (request) => {
    // This is where Bridge integrates
    const result = await bridge.requestDataApproval({
      resource: request.resource,
      purpose: request.purpose,
    });
    
    return {
      granted: result.approved,
      denialReason: result.reason,
    };
  },
});

await gate.run(); // Run as MCP server
```

---

## Session Codes

| Property | Value |
|----------|-------|
| Length | 6 characters |
| Characters | A-Z, 2-9 (no I, O, 0, 1) |
| Expiry | 5 minutes |
| Usage | Single-use |

---

## Signal Commands

| Command | Description |
|---------|-------------|
| `start` | Initialize / welcome message |
| `code` | Generate new session code |
| `status` | List active sessions |
| `revoke` | End all sessions |
| `help` | Show available commands |

---

## Technologies

| Layer | Technology |
|-------|------------|
| Landing Page | Static HTML |
| Signal Integration | signal-cli (unofficial) |
| MCP Server | @modelcontextprotocol/sdk |
| Encryption | libsodium |
| Storage | SQLite (vaults) |

---

## Next Steps

1. **Signal-cli integration** - Wire up actual Signal messaging
2. **Session persistence** - Store sessions in database
3. **MCP-Bridge integration** - Connect MCP server to Bridge
4. **Web fallback** - For users without Signal

---

*Your personal API. All via Signal.*
