# .HMAN Protocol

## Overview

.HMAN uses **dynamic session codes** instead of permanent identifiers. When you need to connect an AI, you generate a fresh code that expires in 60 seconds.

---

## The Flow

```
┌───────────────────────────────────────────────────────────────────┐
│                                                                   │
│  YOU                        .HMAN                        AI       │
│                                                                   │
│   │                           │                           │       │
│   │ "code"                    │                           │       │
│   │─────────────────────────►│                           │       │
│   │                           │                           │       │
│   │ "X7K3PQ (60 sec)"         │                           │       │
│   │◄─────────────────────────│                           │       │
│   │                           │                           │       │
│   │                           │    "Link with X7K3PQ"     │       │
│   │                           │◄──────────────────────────│       │
│   │                           │                           │       │
│   │                           │    "Linked ✓"             │       │
│   │                           │──────────────────────────►│       │
│   │                           │                           │       │
│   │                           │    "Wants calendar"       │       │
│   │                           │◄──────────────────────────│       │
│   │                           │                           │       │
│   │ "Claude wants calendar.   │                           │       │
│   │  Y/N?"                    │                           │       │
│   │◄─────────────────────────│                           │       │
│   │                           │                           │       │
│   │ "Y"                       │                           │       │
│   │─────────────────────────►│                           │       │
│   │                           │                           │       │
│   │                           │    "Here's calendar"      │       │
│   │                           │──────────────────────────►│       │
│   │                           │                           │       │
└───────────────────────────────────────────────────────────────────┘
```

---

## Session Codes

### Format
```
6 alphanumeric characters
Example: X7K3PQ
```

### Properties
- **Valid for 60 seconds** (configurable)
- **Single use** - once linked, code is consumed
- **Case insensitive** - X7K3PQ = x7k3pq
- **Your eyes only** - sent only to your Signal

### Why Dynamic Codes?

| Static ID | Dynamic Code |
|-----------|--------------|
| Permanent | Expires in 60s |
| Can be leaked | Nothing to leak |
| One ID forever | Fresh each time |
| You share once | You initiate each time |

---

## Commands

Message these to .HMAN on Signal:

| Command | Response |
|---------|----------|
| `start` | Welcome message, setup complete |
| `code` | Your 6-char session code (60s) |
| `status` | Active sessions and connections |
| `revoke` | End all active sessions |
| `help` | List of commands |

---

## Request Types

### Data Request
```
───────────────────────────────
Claude wants your calendar.

Y to approve
N to deny
───────────────────────────────
```

### Payment Request
```
───────────────────────────────
Origin Energy: $145.00

A) Share card
B) BSB/Account
C) PayID

Reply A, B, or C
───────────────────────────────
```

### Action Request
```
───────────────────────────────
Your AI wants to call Richard
to organize dinner.

Y to approve
N to deny
───────────────────────────────
```

---

## For AI Developers

### Link to a User

```
POST /api/link
{
  "code": "X7K3PQ",
  "service_name": "My AI App"
}

Response:
{
  "session_id": "sess_abc123",
  "linked": true,
  "expires_at": "2024-01-15T12:30:00Z"
}
```

### Send a Request

```
POST /api/request
{
  "session_id": "sess_abc123",
  "type": "data",
  "message": "Wants your calendar",
  "options": ["Y", "N"]
}

Response:
{
  "request_id": "req_xyz789",
  "status": "pending"
}
```

### Get Response

```
GET /api/request/req_xyz789

Response:
{
  "status": "approved",
  "response": "Y",
  "data": { ... }
}
```

---

## SDK Example

```typescript
import { Hman } from '@hman/sdk';

const hman = new Hman();

// Link with user's session code
const session = await hman.link('X7K3PQ', 'My AI App');

// Request calendar access
const request = await session.request({
  message: 'Wants your calendar for scheduling',
  options: ['Y', 'N']
});

// Wait for user response
const response = await request.waitForResponse();

if (response.approved) {
  const calendar = response.data;
}

// Session ends when user revokes or it expires
```

---

## Security

### Code Generation
- Cryptographically random
- 6 chars = 2 billion combinations
- Rate limited per user

### Session Expiry
- Codes expire in 60 seconds
- Sessions expire after 24 hours of inactivity
- User can revoke anytime

### Audit Trail
Every request and response is logged on your device.

---

*Dynamic. Secure. You're always in control.*
