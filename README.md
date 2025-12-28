# .HMAN

**Connect AI to your life. You stay in control.**

---

## What is .HMAN?

.HMAN is your personal gateway between AI and your data. Add .HMAN on Signal, generate a session code, and give it to any AI. All requests come through Signal—you approve or deny.

---

## Quick Start

1. **Add .HMAN on Signal** → Send "start"
2. **Generate a code** → Send "code"
3. **Get a 6-char code** → `X7K3PQ` (valid 60 seconds)
4. **Give to AI** → "Connect with my .HMAN code: X7K3PQ"
5. **Approve requests** → Reply Y/N on Signal

---

## Example

```
You: code

.HMAN: Your session code:
       X7K3PQ
       Valid for 60 seconds

--- You give code to Claude ---

Claude: "I've connected to your .HMAN"

--- Claude requests calendar ---

.HMAN: Claude wants your calendar.
       Y to approve
       N to deny

You: Y

.HMAN: ✓ Shared with Claude.
```

---

## Why Dynamic Codes?

| Feature | Benefit |
|---------|---------|
| **60-second expiry** | Nothing to leak |
| **You generate** | You're always in control |
| **Single use** | One session per code |
| **Via Signal** | E2E encrypted, private |

---

## Commands

| Send | Get |
|------|-----|
| `start` | Welcome + setup |
| `code` | Session code (60s) |
| `status` | Active connections |
| `revoke` | End all sessions |
| `help` | Command list |

---

## For Developers

See [PROTOCOL.md](PROTOCOL.md) for API docs.

```typescript
import { Hman } from '@hman/sdk';

const session = await Hman.link('X7K3PQ', 'My App');
const calendar = await session.request('calendar');
```

---

## Links

- [Vision](VISION.md) - Why we built this
- [Protocol](PROTOCOL.md) - Technical details
- [Architecture](ARCHITECTURE.md) - Code structure

---

**Free. Open source. Your data, your control.**

[GitHub](https://github.com/Tailor-AUS/Human-Managed-Access-Network)
