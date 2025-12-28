# .HMAN Architecture

> **Your personal API. All via Signal.**

---

## Core Concept

.HMAN is a **conversational interface** to your life. Everything happens via Signal:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                         THE FLOW                                    │
│                                                                     │
│   1. User signs up with mobile number                               │
│   2. SMS verification                                               │
│   3. Signal verification (E2E encrypted)                            │
│   4. User gets unique HMAN code: HMAN-XXXX-XXXX                     │
│   5. Any AI/person/business sends requests to that code             │
│   6. .HMAN relays to user via Signal                                │
│   7. User replies Y/N                                               │
│   8. .HMAN executes or denies                                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
.HMAN/
├── docs/
│   ├── README.md        # What is .HMAN
│   ├── VISION.md        # Why we built it
│   └── PROTOCOL.md      # How it works
│
├── web/                 # Landing page (signup)
│   └── index.html       # Mobile input → Continue on Signal
│
├── server/              # .HMAN backend
│   ├── api/             # REST API for HMAN codes
│   │   ├── signup.ts    # Mobile → SMS → Signal verification
│   │   ├── request.ts   # Receive requests from AIs/businesses
│   │   └── respond.ts   # Process user responses
│   │
│   ├── signal/          # Signal integration
│   │   ├── client.ts    # signal-cli wrapper
│   │   ├── send.ts      # Send messages to users
│   │   └── receive.ts   # Receive user responses
│   │
│   └── db/              # Database
│       ├── users.ts     # HMAN codes ↔ phone numbers
│       ├── requests.ts  # Pending requests
│       └── audit.ts     # What was shared/executed
│
└── sdk/                 # For AI integrations
    └── hman-client.ts   # Send requests to HMAN codes
```

---

## API Endpoints

### 1. Signup
```
POST /api/signup
{
  "phone": "+61412345678"
}

Response:
{
  "status": "sms_sent",
  "message": "Reply YES to create your .HMAN"
}
```

### 2. Verify SMS
```
POST /api/verify-sms
{
  "phone": "+61412345678",
  "code": "YES"
}

Response:
{
  "status": "signal_pending",
  "message": "Check Signal for verification"
}
```

### 3. Complete Signup (after Signal confirmation)
```
Response (via Signal):
{
  "status": "active",
  "hman_code": "HMAN-7K3F-X9P2"
}
```

### 4. Send Request (from AI/business)
```
POST /api/request
{
  "hman_code": "HMAN-7K3F-X9P2",
  "from": "Claude (Anthropic)",
  "type": "calendar_access",
  "message": "Wants your calendar for project planning",
  "options": [
    { "key": "Y", "label": "Approve" },
    { "key": "N", "label": "Deny" }
  ]
}

Response:
{
  "request_id": "req_abc123",
  "status": "pending"
}
```

### 5. Get Response
```
GET /api/request/req_abc123

Response:
{
  "status": "approved",
  "response": "Y",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## Signal Messages

### Request Format
```
─────────────────────────────────
Request from Claude

Claude wants your calendar for
project planning.

Reply Y to approve
Reply N to deny
─────────────────────────────────
```

### Response Format
```
User: Y

.HMAN: ✓ Approved. Shared calendar
       with Claude.
```

### Payment Request
```
─────────────────────────────────
Request from Origin Energy

Payment request: $145.00

A) Share credit card
B) Use BSB/Account
C) Pay via PayID

Reply A, B, or C
─────────────────────────────────
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Web** | Static HTML (Vercel/Netlify) |
| **API** | Node.js / Bun |
| **Signal** | signal-cli (unofficial) |
| **Database** | SQLite / Turso |
| **Queue** | Redis (for async signal messages) |

---

## Files to Keep

| File | Purpose |
|------|---------|
| `README.md` | Overview |
| `VISION.md` | Mission |
| `PROTOCOL.md` | How it works |
| `ARCHITECTURE.md` | This file |
| `apps/web-dashboard/public/index.html` | Landing page |

---

## Files to Remove (old complexity)

- `packages/core/` → Too complex, rebuild simpler
- `packages/mcp-server/` → Not needed initially
- `packages/sync-relay/` → Not needed initially
- `apps/mobile/` → Future, not now
- `apps/demo-cli/` → Not needed
- `MOBILE.md` → Future
- `VPN.md` → Future
- `ROADMAP.md` → Outdated

---

## MVP Focus

### Phase 1: Core Flow
1. ✅ Landing page with signup
2. 🔨 SMS verification (Twilio)
3. 🔨 Signal integration (signal-cli)
4. 🔨 HMAN code generation
5. 🔨 Request relay to user
6. 🔨 Response handling

### Phase 2: AI Integration
- SDK for Claude/GPT to send requests
- MCP server for Claude Desktop

### Phase 3: Actions
- Payment execution
- Calendar management
- Email access

---

*Keep it simple. Signal is the interface. That's it.*
