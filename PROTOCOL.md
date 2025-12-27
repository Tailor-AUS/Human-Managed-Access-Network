# The .HMAN Protocol

> **Your personal AI that works for YOU. Locally. Privately. Always asking.**

---

## What Is It?

.HMAN (dot-H-man) is:

1. **A local app** you download to your device
2. **Your personal AI assistant** that works FOR you
3. **Air-gapped** from the internet (optional, for maximum security)
4. **LLM agnostic** - uses any local model (Llama, Mistral, Phi, etc.)
5. **The gatekeeper** between you and everyone who wants something from you

---

## The Core Idea

```
                    THE WORLD
                        │
    ┌───────────────────┼───────────────────┐
    │                   │                   │
    ▼                   ▼                   ▼
┌────────┐        ┌──────────┐        ┌────────┐
│ Bills  │        │ Your     │        │ Other  │
│ & Pay- │        │ Boss's   │        │ Apps & │
│ ments  │        │ .HMAN    │        │ AIs    │
└───┬────┘        └────┬─────┘        └───┬────┘
    │                  │                  │
    └──────────────────┼──────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │                │
              │  YOUR .HMAN    │  ← Runs locally on your device
              │                │  ← Has its own local LLM
              │  • Receives    │  ← Air-gapped (optional)
              │    requests    │  ← Stores YOUR data
              │  • Processes   │
              │  • Asks YOU    │
              │  • Acts for    │
              │    you         │
              │                │
              └───────┬────────┘
                      │
                      ▼
              ┌────────────────┐
              │                │
              │      YOU       │
              │                │
              │  Always in     │
              │  control       │
              │                │
              └────────────────┘
```

---

## Real Examples

### Example 1: Utility Bill

```
┌──────────────────────────────────────────────────────────────┐
│ 📱 YOUR .HMAN                                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  💰 Payment Request from Origin Energy                      │
│                                                              │
│  Amount: $145.00                                             │
│  For: Electricity (March 2024)                               │
│  Due: April 15, 2024                                         │
│                                                              │
│  ─────────────────────────────────────────────               │
│                                                              │
│  How would you like to handle this?                          │
│                                                              │
│  A) Release credit card to Origin                            │
│     └─ They'll charge your card on file                      │
│                                                              │
│  B) I'll pay via BPay                                        │
│     └─ 5 working days, no card shared                        │
│                                                              │
│  C) I'll pay via PayID (instant)                             │
│     └─ Instant, no card shared                               │
│                                                              │
│  D) Remind me later                                          │
│                                                              │
│  E) Dispute this                                             │
│                                                              │
│  Reply A, B, C, D, or E                                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘

You: "C"

┌──────────────────────────────────────────────────────────────┐
│ 📱 YOUR .HMAN                                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ✅ Payment Processed                                        │
│                                                              │
│  Paid: $145.00 to Origin Energy                              │
│  Method: PayID (origin@bpay.com.au)                          │
│  Reference: 1234567890                                       │
│  Status: Complete                                            │
│                                                              │
│  Origin Energy did NOT receive your credit card.             │
│                                                              │
│  Thanks for your time. 👋                                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Key Point:** You chose option C. Your .HMAN paid the bill FOR you. Origin never got your credit card.

---

### Example 2: Meeting Request (.HMAN to .HMAN)

```
┌──────────────────────────────────────────────────────────────┐
│ 📱 YOUR .HMAN                                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  📅 Meeting Request                                          │
│                                                              │
│  From: Sarah's .HMAN (your manager)                          │
│  Type: 1-on-1                                                │
│  Topic: Q2 Goals Discussion                                  │
│  Duration: 30 minutes                                        │
│                                                              │
│  I checked your calendar. You're available:                  │
│  • Thursday 2pm ✓                                            │
│  • Friday 10am ✓                                             │
│                                                              │
│  ─────────────────────────────────────────────               │
│                                                              │
│  When do you want to do this?                                │
│                                                              │
│  A) Thursday 2pm                                             │
│  B) Friday 10am                                              │
│  C) Delay 1 week                                             │
│  D) Suggest different time                                   │
│  E) Decline                                                  │
│                                                              │
│  Reply A, B, C, D, or E                                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘

You: "A"

┌──────────────────────────────────────────────────────────────┐
│ 📱 YOUR .HMAN                                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ✅ Meeting Confirmed                                        │
│                                                              │
│  1-on-1 with Sarah                                           │
│  Thursday 2pm - 2:30pm                                       │
│  Q2 Goals Discussion                                         │
│                                                              │
│  I've let Sarah's .HMAN know. She's confirmed.               │
│  Added to your calendar.                                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Key Point:** Sarah's .HMAN talked to YOUR .HMAN. You just picked a time. No back-and-forth emails.

---

### Example 3: AI Data Request

```
┌──────────────────────────────────────────────────────────────┐
│ 📱 YOUR .HMAN                                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  🔐 Data Request                                             │
│                                                              │
│  From: Claude (Anthropic)                                    │
│  Wants: Your work calendar for next week                     │
│  Purpose: "Help plan your project timeline"                  │
│                                                              │
│  ─────────────────────────────────────────────               │
│                                                              │
│  I can see you have 12 meetings next week.                   │
│  3 are marked private.                                       │
│                                                              │
│  What would you like to share?                               │
│                                                              │
│  A) All 12 meetings (including private)                      │
│  B) Only 9 non-private meetings                              │
│  C) Just busy/free times (no details)                        │
│  D) Nothing - deny request                                   │
│                                                              │
│  Reply A, B, C, or D                                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘

You: "B"

┌──────────────────────────────────────────────────────────────┐
│ 📱 YOUR .HMAN                                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ✅ Shared with Claude                                       │
│                                                              │
│  Sent: 9 non-private meetings                                │
│  Hidden: 3 private meetings                                  │
│                                                              │
│  Logged to your audit trail.                                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Key Point:** Your .HMAN understood your calendar. It offered smart options. You chose what to share.

---

## The Local LLM

Your .HMAN runs a **local LLM** on your device:

```
┌─────────────────────────────────────────────────┐
│                                                 │
│              YOUR .HMAN (Local)                 │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │         LOCAL LLM                         │  │
│  │                                           │  │
│  │   • Llama 3.2 (3B) - fast, efficient      │  │
│  │   • Mistral 7B - balanced                 │  │
│  │   • Phi-3 - Microsoft, compact            │  │
│  │   • Or any GGUF model                     │  │
│  │                                           │  │
│  │   Runs 100% on YOUR device                │  │
│  │   Never sends data to the cloud           │  │
│  │                                           │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │         YOUR .HMAN DATA FILE              │  │
│  │                                           │  │
│  │   • Calendar                              │  │
│  │   • Contacts                              │  │
│  │   • Payment methods                       │  │
│  │   • Preferences                           │  │
│  │   • Health records                        │  │
│  │   • Documents                             │  │
│  │                                           │  │
│  │   Encrypted. On YOUR device.              │  │
│  │                                           │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Everyone Has a .HMAN

In a world where .HMAN is adopted:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Your       │     │  Your       │     │  Your       │
│  .HMAN      │ ←→  │  Boss's     │ ←→  │  Doctor's   │
│             │     │  .HMAN      │     │  .HMAN      │
└─────────────┘     └─────────────┘     └─────────────┘
       ↕                   ↕                   ↕
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Bank's     │     │  Utility's  │     │  Government │
│  .HMAN      │     │  .HMAN      │     │  .HMAN      │
└─────────────┘     └─────────────┘     └─────────────┘
```

.HMANs talk to each other:
- Negotiate meeting times
- Handle payment requests
- Share only what's approved
- Respect each person's rules

---

## Two Modes

### 1. Online Mode (Signal)
- Uses Signal for messaging
- Note to Self for storage
- Works with cloud AIs
- Best for: everyday use

### 2. Air-Gapped Mode (Local)
- Completely offline
- Local LLM only
- No internet required
- Best for: maximum security, sensitive data

---

## The Download

```
┌─────────────────────────────────────────────────┐
│                                                 │
│            📥 Download .HMAN                    │
│                                                 │
│   A local app that runs on YOUR device.         │
│   Your AI assistant. Your gatekeeper.           │
│                                                 │
│   ┌─────────────────────────────────────────┐   │
│   │                                         │   │
│   │   🍎 macOS      💻 Windows    🐧 Linux  │   │
│   │                                         │   │
│   │      📱 iOS          🤖 Android         │   │
│   │                                         │   │
│   └─────────────────────────────────────────┘   │
│                                                 │
│   Requirements:                                 │
│   • 8GB RAM (16GB for best performance)         │
│   • 10GB disk space                             │
│   • Optional: GPU for faster responses          │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Summary

| Feature | Description |
|---------|-------------|
| **Local** | Runs on YOUR device, not a server |
| **Air-gapped** | Optional: completely offline mode |
| **Your LLM** | Uses local models, no cloud required |
| **Your Data** | Encrypted .hman file, only you can access |
| **Your Choice** | Always asks before acting |
| **Acts for You** | Can make payments, schedule meetings, etc. |
| **Never Shares Secrets** | Credit cards stay with you |

---

> **Thanks for your time.** 👋

*The .HMAN Protocol: Your AI. Your rules. Your data.*
