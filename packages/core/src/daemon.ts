#!/usr/bin/env node
/**
 * HMAN Signal Daemon
 * 
 * Polls signal-cli every 5 seconds for new messages.
 * Processes commands and responds in real-time.
 * 
 * Usage:
 *   HMAN_PHONE=+15551234567 node daemon.js
 * 
 * Or set in .env file.
 */

import { spawn, execSync } from 'child_process';
import { SignalClient, TrustLevel } from './signal/index.js';

// Config from environment
const PHONE_NUMBER = process.env.HMAN_PHONE || process.env.SIGNAL_PHONE || '';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '5000', 10);
const SIGNAL_CLI = process.env.SIGNAL_CLI_PATH || 'signal-cli';

// Colors
const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
};

function log(msg: string, color = c.reset) {
    const time = new Date().toLocaleTimeString();
    console.log(`${c.dim}[${time}]${c.reset} ${color}${msg}${c.reset}`);
}

function header() {
    console.clear();
    console.log(`
${c.cyan}╔═══════════════════════════════════════════════════╗
║                                                   ║
║          .HMAN Signal Daemon                      ║
║                                                   ║
║   Polling every ${POLL_INTERVAL / 1000}s for messages                   ║
║                                                   ║
╚═══════════════════════════════════════════════════╝${c.reset}
`);
    log(`Phone: ${PHONE_NUMBER || '(not set)'}`, c.dim);
    log(`Press Ctrl+C to stop`, c.dim);
    console.log();
}

interface SignalMessage {
    envelope: {
        source: string;
        sourceNumber: string;
        timestamp: number;
        dataMessage?: {
            message: string;
            timestamp: number;
        };
    };
}

/**
 * Check if signal-cli is available
 */
function checkSignalCli(): boolean {
    try {
        execSync(`${SIGNAL_CLI} --version`, { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Receive messages from signal-cli
 */
function receiveMessages(): SignalMessage[] {
    try {
        const result = execSync(
            `${SIGNAL_CLI} -u ${PHONE_NUMBER} receive --json -t 1`,
            {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 10000,
            }
        );

        if (!result.trim()) return [];

        // Parse JSON lines
        const messages: SignalMessage[] = [];
        for (const line of result.trim().split('\n')) {
            if (line.trim()) {
                try {
                    messages.push(JSON.parse(line));
                } catch {
                    // Skip invalid JSON
                }
            }
        }

        return messages;
    } catch (error: any) {
        if (error.status !== 0) {
            log(`Error receiving: ${error.message}`, c.red);
        }
        return [];
    }
}

/**
 * Send a message via signal-cli
 */
function sendMessage(to: string, message: string): boolean {
    try {
        execSync(
            `${SIGNAL_CLI} -u ${PHONE_NUMBER} send -m "${message.replace(/"/g, '\\"')}" ${to}`,
            {
                encoding: 'utf-8',
                stdio: 'pipe',
                timeout: 10000,
            }
        );
        return true;
    } catch (error: any) {
        log(`Error sending to ${to}: ${error.message}`, c.red);
        return false;
    }
}

/**
 * Main daemon loop
 */
async function main() {
    header();

    // Check requirements
    if (!PHONE_NUMBER) {
        log('ERROR: Set HMAN_PHONE environment variable', c.red);
        log('  Example: HMAN_PHONE=+15551234567 node daemon.js', c.dim);
        process.exit(1);
    }

    if (!checkSignalCli()) {
        log('ERROR: signal-cli not found', c.red);
        log('  Install: https://github.com/AsamK/signal-cli', c.dim);
        process.exit(1);
    }

    log('Starting daemon...', c.green);

    // Create Signal client (in-memory state)
    const signal = new SignalClient({ phoneNumber: PHONE_NUMBER });

    // Wire up outgoing messages to signal-cli
    signal.on('outgoing', ({ to, message }: { to: string; message: string }) => {
        log(`→ ${to}: ${message.substring(0, 50)}...`, c.blue);
        sendMessage(to, message);
    });

    await signal.start();

    log('Daemon running. Waiting for messages...', c.green);
    console.log();

    // Poll loop
    const poll = async () => {
        const messages = receiveMessages();

        for (const msg of messages) {
            const from = msg.envelope.sourceNumber || msg.envelope.source;
            const text = msg.envelope.dataMessage?.message;

            if (!text) continue;

            log(`← ${from}: ${text}`, c.yellow);

            // Process message
            const response = await signal.handleIncomingMessage(from, text);

            // Send response
            if (response) {
                log(`→ ${from}: ${response.substring(0, 50)}...`, c.blue);
                sendMessage(from, response);
            }
        }
    };

    // Initial poll
    await poll();

    // Continuous polling
    setInterval(poll, POLL_INTERVAL);
}

// Handle shutdown
process.on('SIGINT', () => {
    console.log();
    log('Shutting down...', c.dim);
    process.exit(0);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled error:', err);
});

main().catch(console.error);
