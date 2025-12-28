# .HMAN Protocol

## Overview

The .HMAN Protocol defines how requests flow from AIs, businesses, and people to you—and how you respond.

---

## The Flow

```
   ┌─────────────┐
   │ AI/Business │
   │ or Person   │
   └──────┬──────┘
          │
          │ 1. Send request to HMAN code
          ▼
   ┌─────────────┐
   │   .HMAN     │
   │   Server    │
   └──────┬──────┘
          │
          │ 2. Relay via Signal
          ▼
   ┌─────────────┐
   │   Signal    │
   │  (on phone) │
   └──────┬──────┘
          │
          │ 3. User reads message
          ▼
   ┌─────────────┐
   │    YOU      │
   └──────┬──────┘
          │
          │ 4. Reply Y/N or A/B/C
          ▼
   ┌─────────────┐
   │   .HMAN     │
   │   Server    │
   └──────┬──────┘
          │
          │ 5. Execute action or return data
          ▼
   ┌─────────────┐
   │ AI/Business │
   └─────────────┘
```

---

## HMAN Code Format

Your unique identifier:

```
HMAN-XXXX-XXXX
```

Example: `HMAN-7K3F-X9P2`

- 8 alphanumeric characters
- Case insensitive
- Easy to share verbally or in text

---

## Request Types

### 1. Data Request
AI wants access to your data (calendar, contacts, etc.)

```
───────────────────────────
Request from Claude

Wants: Your calendar
Purpose: Project planning

Y to approve
N to deny
───────────────────────────
```

### 2. Payment Request
Business wants payment

```
───────────────────────────
Request from Origin Energy

Amount: $145.00
For: Electricity (March)

A) Share credit card
B) Use BSB/Account
C) Pay via PayID
───────────────────────────
```

### 3. Meeting Request
Someone wants to schedule time

```
───────────────────────────
Request from Sarah's .HMAN

1-on-1 meeting
Topic: Q2 Goals

A) Thursday 2pm
B) Friday 10am
C) Decline
───────────────────────────
```

### 4. Action Request
AI wants to do something on your behalf

```
───────────────────────────
Request from Your Assistant

"Call Richard to organize dinner"

A) Approve call
B) Deny
───────────────────────────
```

---

## Response Format

Simple replies:
- `Y` / `N` for yes/no
- `A` / `B` / `C` for options
- Free text for custom responses

---

## Security

### End-to-End Encryption
All messages via Signal Protocol. No one—not even .HMAN—can read your messages in transit.

### Phone Verification
Your HMAN code is tied to your phone number. Only you can receive and respond to requests.

### Audit Trail
Every request and response is logged (on your side). You can see:
- Who requested what
- When you approved/denied
- What was shared/executed

---

## API Reference

### Create Account
```
POST /api/signup
{ "phone": "+61412345678" }
```

### Send Request
```
POST /api/request
{
  "hman_code": "HMAN-7K3F-X9P2",
  "from": "Claude",
  "type": "data_request",
  "message": "Wants your calendar",
  "options": [
    { "key": "Y", "label": "Approve" },
    { "key": "N", "label": "Deny" }
  ]
}
```

### Check Response
```
GET /api/request/:id
```

---

## SDK Usage

```typescript
import { HmanClient } from '@hman/sdk';

const client = new HmanClient();

// Send a request
const request = await client.request({
  hmanCode: 'HMAN-7K3F-X9P2',
  from: 'My AI App',
  message: 'Wants your calendar for scheduling',
  options: ['Y', 'N']
});

// Wait for response
const response = await client.waitForResponse(request.id);

if (response.approved) {
  const calendar = response.data;
  // Use the calendar data
}
```

---

*Simple. Secure. Signal.*
