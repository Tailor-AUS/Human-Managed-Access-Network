# .HMAN

**Your personal API. All via Signal.**

---

## What is .HMAN?

.HMAN gives you a unique code (like `HMAN-7K3F-X9P2`) that any AI, business, or person can use to reach you. All requests come to you via Signal. You reply to approve or deny.

```
AI/Business → Your HMAN Code → Signal Message → You Reply → Done
```

---

## How It Works

1. **Sign up** with your mobile number
2. **Verify** via SMS and Signal
3. **Get your code**: `HMAN-XXXX-XXXX`
4. **Give code to any AI** (Claude, GPT, etc.)
5. **Receive requests via Signal**
6. **Reply Y/N** to approve or deny

---

## Example: AI Request

```
───────────────────────────────────
.HMAN

Request from Claude

Claude wants your calendar for
project planning.

Reply Y to approve
Reply N to deny
───────────────────────────────────

You: Y

───────────────────────────────────
.HMAN

✓ Approved. Shared calendar with Claude.
───────────────────────────────────
```

---

## Example: Payment

```
───────────────────────────────────
.HMAN

Request from Origin Energy

Payment request: $145.00

A) Share credit card
B) Use BSB/Account
C) Pay via PayID

Reply A, B, or C
───────────────────────────────────

You: C

───────────────────────────────────
.HMAN

✓ Paid via PayID. They never got your card.
───────────────────────────────────
```

---

## Why Signal?

- **End-to-end encrypted** — Only you can read your messages
- **Already on your phone** — No new app needed
- **Trusted by millions** — Open source, battle-tested

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Web | Static HTML |
| API | Node.js / Bun |
| Signal | signal-cli |
| Database | SQLite / Turso |

---

## Project Structure

```
.hman/
├── README.md          # This file
├── VISION.md          # Why we built it
├── PROTOCOL.md        # How it works
├── ARCHITECTURE.md    # Technical details
│
├── apps/
│   └── web-dashboard/
│       └── public/
│           └── index.html  # Landing page
│
└── packages/
    ├── core/          # Core SDK
    └── shared/        # Shared types
```

---

## Get Started

Visit the landing page and enter your mobile number.

---

## License

MIT

---

*Free. Open source. Your data, your control.*
