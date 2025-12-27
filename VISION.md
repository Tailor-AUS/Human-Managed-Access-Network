# HMAN Vision

> **Your secrets stay hidden. Train any AI.**

---

## What is HMAN?

HMAN (.hman) is a protocol that lets you:
1. **Store your personal data** in Signal's Note to Self (encrypted, private, yours)
2. **Connect any AI** (Claude, GPT, Gemini, your own models)
3. **Approve what gets shared** via simple text messages

**Barrier to entry: Just have Signal.**

---

## The Problem

Today, when you use AI:
- You give your data to every AI company separately
- Your credit card goes to OpenAI, Anthropic, Google, Microsoft...
- Your medical records, calendar, contacts - scattered everywhere
- No way to know what AI has accessed
- No way to revoke access

## The Solution

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   YOUR SIGNAL "NOTE TO SELF" = YOUR ENCRYPTED VAULT                        │
│                                                                             │
│   [HMAN:PROFILE]                                                            │
│   Name: John Smith                                                          │
│   Email: john@example.com                                                   │
│                                                                             │
│   [HMAN:PAYMENT]                                                            │
│   PayID: john@gmail.com                                                     │
│   Bank: Commonwealth                                                        │
│                                                                             │
│   [HMAN:HEALTH]                                                             │
│   Blood Type: A+                                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Your data stays HERE
                                    │ (E2E encrypted, Signal Protocol)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                              HMAN Protocol                                  │
│                                                                             │
│   • Connects to any AI via MCP                                              │
│   • Receives access requests                                                │
│   • Forwards to you via Signal                                              │
│   • Tracks all connections and data sharing                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
              ┌──────────┐   ┌──────────┐   ┌──────────┐
              │  Claude  │   │   GPT    │   │  Gemini  │    ...any AI
              └──────────┘   └──────────┘   └──────────┘
```

---

## How It Works

### Step 1: Store Your Data in Note to Self

Open Signal, go to Note to Self, add your data:

```
[HMAN:PROFILE]
Name: John Smith
Email: john@example.com
Phone: +61 400 000 000

[HMAN:PAYMENT]
PayID: john@gmail.com
BSB: 062-000
Account: 1234 5678

[HMAN:HEALTH]
Blood Type: A+
Allergies: Penicillin
Medicare: 1234 5678 9

[HMAN:CALENDAR]
2024-03-15 14:00: Meeting with Sarah
2024-03-16 16:00: Dentist
```

**This data NEVER leaves Signal. It's encrypted. Even Signal can't read it.**

### Step 2: Connect HMAN

Add HMAN to your Signal contacts. Send "Hi".

HMAN will help you set up connections to your AIs.

### Step 3: AI Requests, You Approve

```
HMAN: 🔐 Access Request

Claude wants: Your calendar for tomorrow
Purpose: "Schedule a follow-up meeting"

Reply Y to approve, N to deny
```

You: `Y`

```
HMAN: ✅ Approved

Copy the relevant data from your Note to Self 
and send it here. I'll pass it to Claude.
```

You: `[paste from Note to Self]`
```
2024-03-15 14:00: Meeting with Sarah
2024-03-16 16:00: Dentist
```

```
HMAN: ✅ Shared with Claude

📋 Data sent: 2 calendar items
📊 Connection: Claude (Anthropic)
⏱️ Time: 2024-03-15 10:30 AM
```

### Step 4: Track Everything

Ask HMAN for your dashboard:

```
You: STATUS

HMAN: 📊 Your HMAN Dashboard

🔗 Connected AIs:
• Claude (Anthropic) - active since Mar 1
• GPT-4 (OpenAI) - active since Mar 5

📋 Recent Access:
• Mar 15: Claude accessed calendar (approved)
• Mar 14: GPT-4 accessed email (denied)
• Mar 10: Claude accessed profile (approved)

📁 Your Data Categories:
• Profile: 4 items
• Payment: 2 items
• Health: 3 items
• Calendar: 12 items

Type DISCONNECT [AI] to revoke access
Type HISTORY for full audit log
```

---

## Why Signal?

Signal is the **one proven place where secrets stay hidden**.

| Feature | Why It Matters |
|---------|----------------|
| **Signal Protocol** | Gold standard of E2E encryption |
| **Zero Knowledge** | Even Signal can't read your data |
| **Battle Tested** | Used by journalists, activists, security experts |
| **Open Source** | Code is audited, no hidden backdoors |
| **Syncs Across Devices** | Access from phone, tablet, desktop |
| **Already Trusted** | Millions already use it for sensitive info |
| **Free** | Non-profit, no ads, no premium tier |

---

## One Profile, Any AI

The .HMAN protocol is **LLM agnostic**.

Train Claude on your preferences. Switch to GPT. Try Gemini. Use Llama. Build your own model.

**They all connect through HMAN. They all ask you for permission.**

Your data stays in your Signal. You choose what each AI sees.

---

## Core Principles

### 1. Just Have Signal
No app to install. No account to create. No password to remember.
If you have Signal, you can use HMAN.

### 2. Your Data Never Leaves
Your Note to Self is YOUR vault. Data is only shared when YOU copy-paste it.
HMAN tracks the requests and approvals, not the data itself.

### 3. Human In The Loop - Always
Every access request requires your explicit approval.
No exceptions. No "set it and forget it." You decide, every time.

### 4. Track Everything
Know which AIs are connected. See what data was shared.
Full audit log of every request, every approval, every denial.

### 5. LLM Agnostic
HMAN works with any AI that supports MCP.
No vendor lock-in. Switch freely. Your profile follows you.

---

## The Tagline

> **Your secrets stay hidden. Train any AI.**

Or more simply:

> **Your data. Your rules. Any AI.**

---

## Get Started

1. Install Signal (if you haven't)
2. Open Note to Self
3. Add your data using [HMAN:TAG] format
4. Add HMAN to your contacts
5. Send "Hi"
6. You're in control

---

*HMAN: Because your personal data should stay personal.*
