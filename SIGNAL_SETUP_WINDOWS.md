# HMAN Signal-First Setup Guide for Windows

**HMAN is designed to be controlled entirely via Signal messaging - no web dashboard needed!**

This guide will help you set up Signal integration for complete HMAN control from your phone.

## Why Signal-First?

- 🔐 **E2E Encrypted** - All HMAN interactions are protected by Signal Protocol
- 📱 **Always With You** - Control your data from your phone, anywhere
- 🚫 **No Web Server** - Reduced attack surface, no browser required
- 💬 **Natural Commands** - Reply with `APPROVE`, `DENY`, `STATUS` etc.

## Prerequisites

### 1. Install Java 17+ (Required for signal-cli)

Run this command in an **elevated PowerShell** (Run as Administrator):

```powershell
winget install Azul.Zulu.17.JDK --accept-package-agreements --accept-source-agreements
```

Or download manually from:
- [Azul Zulu JDK 17](https://www.azul.com/downloads/?version=java-17-lts&os=windows&package=jdk)
- [Microsoft Build of OpenJDK 17](https://learn.microsoft.com/en-us/java/openjdk/download#openjdk-17)

After installation, **restart your terminal** and verify:
```powershell
java --version
```

### 2. Install signal-cli

#### Option A: Download Pre-built Release (Recommended)

1. Download the latest release from:
   https://github.com/AsamK/signal-cli/releases

2. Download `signal-cli-0.13.5.tar.gz` (or latest version)

3. Extract to a permanent location:
   ```powershell
   # Create install directory
   mkdir C:\tools\signal-cli

   # Extract (you can use 7-Zip or WinRAR)
   # Or use tar if available:
   tar -xzf signal-cli-0.13.5.tar.gz -C C:\tools\
   ```

4. Add to PATH:
   ```powershell
   # Add to user PATH (run in PowerShell)
   [Environment]::SetEnvironmentVariable(
       "Path",
       [Environment]::GetEnvironmentVariable("Path", "User") + ";C:\tools\signal-cli-0.13.5\bin",
       "User"
   )
   ```

5. Restart terminal and verify:
   ```powershell
   signal-cli --version
   ```

#### Option B: Use scoop (Alternative)

```powershell
# Install scoop if not installed
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex

# Install signal-cli
scoop bucket add extras
scoop install signal-cli
```

## Linking Signal to Your Existing Account

The recommended approach is to link HMAN as a **secondary device** to your existing Signal account:

### Step 1: Generate Linking QR Code

```powershell
signal-cli link -n "HMAN"
```

This will output a URI starting with `sgnl://`. You can:
1. Convert this to a QR code at https://www.qrcode-monkey.com/
2. Or use the HMAN Signal setup CLI (see below)

### Step 2: Scan from Signal App

1. Open Signal on your phone
2. Go to **Settings > Linked Devices**
3. Tap **Link New Device**
4. Scan the QR code from Step 1

### Alternative: Register New Account

If you want to use a dedicated number for HMAN:

```powershell
# Request verification code
signal-cli -u +YOUR_PHONE_NUMBER register

# Enter the code received via SMS
signal-cli -u +YOUR_PHONE_NUMBER verify CODE
```

## Testing Signal Integration

### Send a Test Message

```powershell
signal-cli -u +YOUR_PHONE_NUMBER send -m "HMAN is connected!" +YOUR_PHONE_NUMBER
```

### Run HMAN Signal Setup CLI

```powershell
cd c:\Users\knoxh\HMAN\Human-Managed-Access-Network
pnpm --filter @hman/demo-cli signal
```

This interactive CLI will:
1. Check signal-cli installation
2. Help you register or link your account
3. Send test messages
4. Start the message daemon for real-time notifications

## HMAN Access Request Flow

Once Signal is configured, HMAN will:

1. **Send notifications** when AI agents request access to your data
2. **Wait for your response** - reply with:
   - `APPROVE` - Grant access
   - `APPROVE 30` - Grant access for 30 minutes
   - `DENY` - Deny access
   - `DENY reason` - Deny with a reason

Example notification:
```
🔐 HMAN Access Request

Agent: Claude
Resource: finance/transactions
Permission: GATED

Reply APPROVE or DENY
```

## Troubleshooting

### Java not found
- Ensure Java is installed and in PATH
- Restart your terminal after installation
- Check with: `java --version`

### signal-cli not found
- Ensure signal-cli is in PATH
- Restart your terminal
- Check with: `signal-cli --version`

### Registration failed
- Ensure phone number is in E.164 format (+YOUR_PHONE_NUMBER)
- Check if you've reached Signal's rate limits
- Try again after a few minutes

### Messages not received
- Ensure daemon is running: `signal-cli daemon`
- Check your Signal app for linked device status
- Verify the account is properly linked

## Your Configuration

- **Phone Number**: +YOUR_PHONE_NUMBER
- **Device Name**: HMAN
- **Timezone**: Australia/Sydney
