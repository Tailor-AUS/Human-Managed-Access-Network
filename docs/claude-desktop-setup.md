# Claude Desktop Integration Guide

This guide explains how to connect HMAN Gate to Claude Desktop using the Model Context Protocol (MCP).

## Prerequisites

1. **Claude Desktop** installed ([download](https://claude.ai/download))
2. **Node.js 18+** installed
3. **HMAN** built and ready:
   ```bash
   cd Human-Managed-Access-Network
   pnpm install
   pnpm build
   ```

## Configuration

### Step 1: Locate Claude Desktop Config

The Claude Desktop configuration file is located at:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### Step 2: Add HMAN Gate as MCP Server

Edit the configuration file and add HMAN Gate to the `mcpServers` section:

```json
{
  "mcpServers": {
    "hman-gate": {
      "command": "node",
      "args": [
        "/path/to/Human-Managed-Access-Network/packages/mcp-server/dist/cli.js"
      ],
      "env": {
        "HMAN_PASSPHRASE": "your-secure-passphrase"
      }
    }
  }
}
```

**Important:** Replace `/path/to/Human-Managed-Access-Network` with the actual path to your HMAN installation.

### Step 3: Set Your Passphrase

For security, use an environment variable instead of hardcoding your passphrase:

```json
{
  "mcpServers": {
    "hman-gate": {
      "command": "node",
      "args": [
        "/path/to/Human-Managed-Access-Network/packages/mcp-server/dist/cli.js"
      ],
      "env": {
        "HMAN_PASSPHRASE": "${HMAN_PASSPHRASE}"
      }
    }
  }
}
```

Then set the environment variable in your shell profile:

```bash
# Add to ~/.bashrc, ~/.zshrc, or equivalent
export HMAN_PASSPHRASE="your-secure-passphrase"
```

### Step 4: Restart Claude Desktop

After saving the configuration, restart Claude Desktop to load the HMAN Gate server.

## Verification

Once connected, ask Claude:

> "What HMAN resources do you have access to?"

Claude should respond with a list of available resources from your HMAN vaults.

## Usage Examples

### Reading Open Data (Auto-approved)

> "What's my display name in HMAN?"

Claude will automatically access `hman://identity/profile` (Level 0 - Open) without prompting.

### Reading Standard Data (Notified)

> "What events do I have on my calendar?"

Claude will access `hman://calendar/events` (Level 1 - Standard). You'll receive a notification that this was accessed.

### Reading Gated Data (Approval Required)

> "What did I spend on groceries last month?"

Claude will request access to `hman://finance/transactions` (Level 2 - Gated). You'll see a prompt:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔐 ACCESS REQUEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Requester: Claude (ai_model)
Resource:  hman://finance/transactions
Purpose:   Analyze spending patterns
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[a] Allow once
[t] Allow for 1 hour
[d] Deny
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Reading Locked Data (Always Denied)

> "What are my saved passwords?"

Claude cannot access `hman://secrets/passwords` (Level 3 - Locked). The request will be automatically denied.

## Available Tools

HMAN Gate exposes these tools to Claude:

| Tool | Description | Permission |
|------|-------------|------------|
| `approve_payment` | Request approval for PayID payment | Gated |
| `create_delegation` | Delegate access to another user | Gated |
| `schedule_event` | Add calendar event | Standard |
| `add_diary_entry` | Add diary entry | Standard |
| `query_audit_log` | View access history | Standard |

### Example Tool Usage

> "Add a reminder to my calendar for tomorrow at 3pm to call the dentist"

Claude will use the `schedule_event` tool to create the calendar entry.

> "Show me who has accessed my financial data in the past week"

Claude will use the `query_audit_log` tool to retrieve the access history.

## Security Best Practices

1. **Use a strong passphrase** - At least 20 characters with mixed case, numbers, and symbols
2. **Don't share your config** - The passphrase should never be committed to version control
3. **Review access logs** - Periodically ask Claude to show you the audit log
4. **Revoke if needed** - If you suspect unauthorized access, change your passphrase

## Troubleshooting

### "HMAN Gate not initialized"

The passphrase wasn't set correctly. Check:
1. The `HMAN_PASSPHRASE` environment variable is set
2. Claude Desktop was restarted after configuration changes

### "Access denied"

This is expected for Locked (Level 3) resources. For Gated resources, ensure you're responding to the approval prompt in the terminal where HMAN Gate is running.

### "Vault not found"

The requested resource type doesn't exist. Run the demo to initialize vaults:
```bash
pnpm dev:demo
```

### Connection Issues

Check the MCP server is built:
```bash
pnpm build
ls packages/mcp-server/dist/cli.js
```

## Architecture Overview

```
┌─────────────────┐      MCP       ┌─────────────────┐
│  Claude Desktop │ ◄────────────► │   HMAN Gate     │
│                 │                │   (MCP Server)  │
└─────────────────┘                └────────┬────────┘
                                            │
                                            ▼
                                   ┌─────────────────┐
                                   │   HMAN Core     │
                                   │  - Encryption   │
                                   │  - Vaults       │
                                   │  - Permissions  │
                                   │  - Audit Log    │
                                   └─────────────────┘
```

All data remains encrypted on your device. Claude only sees decrypted data when you explicitly approve access.
