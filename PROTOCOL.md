# .HMAN Protocol

## Overview

.HMAN is a **relay** between AI and your data. Nothing happens without your approval. You start with maximum control and can unlock automation as you build trust.

---

## Trust Levels

### Level 1: Manual (Default)
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

### Level 2: Connected
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

### Level 3: Pre-Approved
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

## How Trust Progresses

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

## Commands by Trust Level

### Level 1 (Manual)
| Command | Description |
|---------|-------------|
| `start` | Initialize .HMAN |
| `code` | Generate session code |
| `Y` / `N` | Approve / deny request |
| `status` | View active sessions |
| `revoke` | End all sessions |
| `help` | Show commands |

### Level 2 (Connected)
| Command | Description |
|---------|-------------|
| `connect` | Start OAuth flow to link a service |
| `disconnect` | Remove a connected service |
| `connections` | List connected services |

### Level 3 (Pre-Approved)
| Command | Description |
|---------|-------------|
| `rules` | View current auto-approve rules |
| `allow <AI> <action> <data>` | Add a rule |
| `deny <AI>` | Remove AI from pre-approved |
| `audit` | View what was auto-approved |

---

## Data Flow by Level

### Level 1: Manual
```
AI ─────► .HMAN ─────► Signal ─────► YOU
                                      │
                                      │ (you type/paste data)
                                      ▼
AI ◄───── .HMAN ◄───── Signal ◄───── YOU
```

### Level 2: Connected
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

### Level 3: Pre-Approved
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

## Session Codes

| Property | Value |
|----------|-------|
| Length | 6 characters |
| Characters | A-Z, 2-9 (no I, O, 0, 1) |
| Expiry | 5 minutes |
| Usage | Single-use |

---

## Security Guarantees

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

## Pull the Plug

At any level, send **"revoke"** to immediately:
- End all active sessions
- Disconnect all AIs
- Cancel all in-flight requests

OAuth connections remain (you control those separately via `disconnect`).

---

## API for AI Developers

### Link Session
```
POST /api/link
{ "code": "X7K3PQ", "service": "Claude" }
```

### Request Data
```
POST /api/request
{
  "session_id": "sess_123",
  "type": "calendar",
  "purpose": "Project planning",
  "read_only": true
}
```

### Check Response
```
GET /api/request/:id
→ { "status": "approved", "data": {...} }
→ { "status": "denied", "reason": "User declined" }
→ { "status": "pending" }
```

---

*Start with control. Unlock speed as you build trust.*
