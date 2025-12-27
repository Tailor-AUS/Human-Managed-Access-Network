#!/usr/bin/env node
/**
 * HMAN Signal-First Demo
 * 
 * This demo runs HMAN entirely via Signal messaging.
 * All interactions happen through your phone - no web dashboard needed.
 */

import { createSignalService, SignalService } from '@hman/core';

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset'): void {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(title: string): void {
    console.log('');
    log('═'.repeat(60), 'cyan');
    log(`  ${title}`, 'bright');
    log('═'.repeat(60), 'cyan');
    console.log('');
}

const PHONE_NUMBER = '+61420309085';

// Demo state
let pendingRequests = [
    {
        id: 'A',
        requester: 'Claude',
        requesterType: 'ai_model' as const,
        resource: 'Finance / Budget Analysis',
        purpose: 'Analyze spending patterns for budget recommendations',
    },
    {
        id: 'B',
        requester: 'Energy Australia Bot',
        requesterType: 'service' as const,
        resource: 'Identity / Address',
        purpose: 'Update billing address',
    },
];

async function main(): Promise<void> {
    header('HMAN Signal-First Interface');

    log('This demo runs HMAN entirely via Signal messaging.', 'dim');
    log('All interactions happen through your phone.', 'dim');
    console.log('');

    // Check signal-cli
    log('Checking signal-cli installation...', 'yellow');

    const signal = createSignalService(PHONE_NUMBER);
    const status = await signal.checkInstallation();

    if (!status.installed) {
        log('✗ signal-cli not installed', 'red');
        log('  Please install signal-cli first (requires Java 21+)', 'dim');
        process.exit(1);
    }

    log(`✓ signal-cli ${status.version}`, 'green');

    if (!status.registered) {
        log('✗ Signal account not linked', 'red');
        log('  Run: signal-cli link -n "HMAN"', 'dim');
        log('  Then scan the QR code from Signal app', 'dim');
        process.exit(1);
    }

    log('✓ Signal account linked', 'green');
    console.log('');

    // Start daemon
    header('Starting Signal Daemon');
    log('HMAN is now listening for commands via Signal.', 'dim');
    log('Send messages to control your data.', 'dim');
    console.log('');

    // Send welcome message
    await sendWelcomeMessage(signal);

    // Listen for messages
    signal.on('message', async (msg) => {
        log(`━━━ Incoming Message ━━━`, 'magenta');
        log(`From: ${msg.sender}`, 'cyan');
        log(`Message: ${msg.body}`, 'reset');
        console.log('');

        // Process command
        await processCommand(signal, msg.body);
    });

    signal.on('error', (err) => {
        log(`Error: ${err.message}`, 'red');
    });

    signal.on('connected', () => {
        log('✓ Daemon connected', 'green');
    });

    signal.on('disconnected', () => {
        log('Daemon disconnected', 'yellow');
    });

    await signal.startDaemon();

    log('', 'reset');
    log('HMAN is online! Send "HELP" via Signal to see commands.', 'green');
    log('Press Ctrl+C to stop.', 'dim');
    console.log('');

    // Keep running
    await new Promise(() => { });
}

async function sendWelcomeMessage(signal: SignalService): Promise<void> {
    await signal.sendMessage(PHONE_NUMBER,
        `🟢 HMAN Signal Interface Online

Your privacy-first data vault is ready.

📊 STATUS - Check vaults & requests
📁 VAULTS - List your vaults  
⏳ PENDING - See access requests
✅ APPROVE / 🚫 DENY - Respond to requests
📖 HELP - All commands

You have 2 pending access requests.`
    );
    log('✓ Welcome message sent', 'green');
}

async function processCommand(signal: SignalService, text: string): Promise<void> {
    const cmd = text.toUpperCase().trim();
    const parts = cmd.split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    try {
        switch (command) {
            case 'STATUS':
            case 'S':
                await handleStatus(signal);
                break;

            case 'VAULTS':
            case 'V':
                await handleVaults(signal);
                break;

            case 'PENDING':
            case 'P':
                await handlePending(signal);
                break;

            case 'APPROVE':
            case 'A':
            case 'YES':
            case 'Y':
            case 'OK':
                await handleApprove(signal, args[0] || 'A', args[1]);
                break;

            case 'DENY':
            case 'D':
            case 'NO':
            case 'N':
                await handleDeny(signal, args[0] || 'A', args.slice(1).join(' '));
                break;

            case 'HISTORY':
            case 'H':
                await handleHistory(signal);
                break;

            case 'HELP':
            case '?':
                await handleHelp(signal);
                break;

            case 'LOCK':
            case 'L':
                await handleLock(signal);
                break;

            case 'EXPORT':
            case 'E':
                await handleExport(signal);
                break;

            default:
                await signal.sendMessage(PHONE_NUMBER,
                    `❓ Unknown: "${text}"\n\nReply HELP for commands`
                );
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        await signal.sendMessage(PHONE_NUMBER, `❌ Error: ${msg}`);
    }
}

async function handleStatus(signal: SignalService): Promise<void> {
    await signal.sendMessage(PHONE_NUMBER,
        `📊 HMAN Status

🟢 Signal: Connected
🔒 Vaults: 4 locked, 2 unlocked

📁 Total Vaults: 6
⏳ Pending Requests: ${pendingRequests.length}
👥 Delegations: 3

🕐 Last Activity: 5 minutes ago`
    );
    log('→ Sent status', 'dim');
}

async function handleVaults(signal: SignalService): Promise<void> {
    await signal.sendMessage(PHONE_NUMBER,
        `📁 Your Vaults

🔓 Identity (8 items) 🟢
🔒 Finance (23 items) 🟠
🔒 Health (12 items) 🟠
🔓 Calendar (45 items) 🟡
🔒 Secrets (5 items) 🔴
🔒 Diary (156 items) 🟡

Legend: 🟢Open 🟡Standard 🟠Gated 🔴Locked`
    );
    log('→ Sent vaults list', 'dim');
}

async function handlePending(signal: SignalService): Promise<void> {
    if (pendingRequests.length === 0) {
        await signal.sendMessage(PHONE_NUMBER, '✅ No pending requests');
        return;
    }

    const lines = pendingRequests.map(p => {
        const icon = p.requesterType === 'ai_model' ? '🤖' :
            p.requesterType === 'service' ? '🔌' : '👤';
        return `${p.id}. ${icon} ${p.requester}\n   📂 ${p.resource}\n   📝 ${p.purpose}`;
    });

    await signal.sendMessage(PHONE_NUMBER,
        `⏳ Pending Requests (${pendingRequests.length})

${lines.join('\n\n')}

Reply: A to approve first
       D A to deny first
       A 1h to approve for 1 hour`
    );
    log('→ Sent pending requests', 'dim');
}

async function handleApprove(signal: SignalService, requestId: string, duration?: string): Promise<void> {
    const id = requestId.toUpperCase();
    const idx = pendingRequests.findIndex(r => r.id === id);

    if (idx === -1 && pendingRequests.length > 0) {
        // Default to first request
        const request = pendingRequests[0];
        pendingRequests.shift();

        const durationText = duration ? ` for ${duration}` : '';
        await signal.sendMessage(PHONE_NUMBER,
            `✅ Approved: ${request.requester}\n   ${request.resource}${durationText}\n\n${pendingRequests.length} requests remaining`
        );
    } else if (idx >= 0) {
        const request = pendingRequests[idx];
        pendingRequests.splice(idx, 1);

        const durationText = duration ? ` for ${duration}` : '';
        await signal.sendMessage(PHONE_NUMBER,
            `✅ Approved: ${request.requester}\n   ${request.resource}${durationText}\n\n${pendingRequests.length} requests remaining`
        );
    } else {
        await signal.sendMessage(PHONE_NUMBER, '⚠️ No pending requests to approve');
    }

    log(`→ Approved request ${requestId}`, 'green');
}

async function handleDeny(signal: SignalService, requestId: string, reason?: string): Promise<void> {
    const id = requestId.toUpperCase();
    const idx = pendingRequests.findIndex(r => r.id === id);

    if (idx === -1 && pendingRequests.length > 0) {
        const request = pendingRequests[0];
        pendingRequests.shift();

        const reasonText = reason ? `\n   Reason: ${reason}` : '';
        await signal.sendMessage(PHONE_NUMBER,
            `🚫 Denied: ${request.requester}\n   ${request.resource}${reasonText}\n\n${pendingRequests.length} requests remaining`
        );
    } else if (idx >= 0) {
        const request = pendingRequests[idx];
        pendingRequests.splice(idx, 1);

        const reasonText = reason ? `\n   Reason: ${reason}` : '';
        await signal.sendMessage(PHONE_NUMBER,
            `🚫 Denied: ${request.requester}\n   ${request.resource}${reasonText}\n\n${pendingRequests.length} requests remaining`
        );
    } else {
        await signal.sendMessage(PHONE_NUMBER, '⚠️ No pending requests to deny');
    }

    log(`→ Denied request ${requestId}`, 'red');
}

async function handleHistory(signal: SignalService): Promise<void> {
    await signal.sendMessage(PHONE_NUMBER,
        `📜 Recent Activity

✅ Access Granted to Claude
   Calendar · 5m ago

🚫 Access Denied to GPT-4
   Health Records · 1h ago

✅ Vault Unlocked
   Calendar · 2h ago

📤 Export Created
   Identity vault · 3h ago

👥 Delegation Added
   Emergency Contact · 1d ago`
    );
    log('→ Sent history', 'dim');
}

async function handleHelp(signal: SignalService): Promise<void> {
    await signal.sendMessage(PHONE_NUMBER,
        `📖 HMAN Commands

📊 STATUS (S) - System status
📁 VAULTS (V) - List vaults
⏳ PENDING (P) - Access requests

✅ APPROVE [id] [duration]
   • A, YES, Y, OK also work
   • APPROVE A 1h - for 1 hour
   
🚫 DENY [id] [reason]
   • D, NO, N also work
   • DENY A privacy - with reason

📜 HISTORY (H) - Recent activity
🔒 LOCK (L) - Lock all vaults
📤 EXPORT (E) - Export .hman file

Just reply with any command!`
    );
    log('→ Sent help', 'dim');
}

async function handleLock(signal: SignalService): Promise<void> {
    await signal.sendMessage(PHONE_NUMBER,
        `🔒 All vaults locked

Your data is secured.
Reply UNLOCK to access again.`
    );
    log('→ Locked all vaults', 'yellow');
}

async function handleExport(signal: SignalService): Promise<void> {
    await signal.sendMessage(PHONE_NUMBER,
        `📤 Export initiated

Creating encrypted .hman file...
(In production, file would be sent as attachment)

✅ Export complete
   my-identity.hman (0.72 KB)
   Encrypted with your passphrase`
    );
    log('→ Export initiated', 'dim');
}

main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});
