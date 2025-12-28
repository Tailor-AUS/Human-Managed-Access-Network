#!/usr/bin/env node
/**
 * HMAN Terminal Demo
 * 
 * Interactive terminal for testing .HMAN without Signal.
 * Simulates the complete flow: session codes, approvals, trust levels.
 */

import * as readline from 'readline';
import { SignalClient, TrustLevel } from './signal/index.js';

// ANSI colors
const colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
};

function log(msg: string, color = colors.reset) {
    console.log(`${color}${msg}${colors.reset}`);
}

function header(title: string) {
    console.log();
    log('━'.repeat(50), colors.dim);
    log(`  ${title}`, colors.bold);
    log('━'.repeat(50), colors.dim);
}

async function main() {
    console.clear();

    log(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║          .HMAN Terminal Demo                      ║
║                                                   ║
║   Simulates Signal interaction in terminal        ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
`, colors.cyan);

    // Create Signal client (simulated)
    const signal = new SignalClient({
        phoneNumber: '+15551234567', // Demo number
    });

    // Capture outgoing messages
    signal.on('outgoing', ({ to, message }: { to: string; message: string }) => {
        log(`\n[.HMAN → ${to}]`, colors.blue);
        log(message, colors.dim);
        console.log();
    });

    await signal.start();

    // Demo user phone
    const userPhone = '+15559876543';

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const prompt = () => {
        rl.question(`${colors.green}You > ${colors.reset}`, async (input) => {
            if (!input.trim()) {
                prompt();
                return;
            }

            if (input.toLowerCase() === 'quit' || input.toLowerCase() === 'exit') {
                log('\nGoodbye!', colors.cyan);
                rl.close();
                process.exit(0);
            }

            // Simulate user sending message
            const response = await signal.handleIncomingMessage(userPhone, input);

            log(`\n[.HMAN]`, colors.blue);
            log(response, colors.reset);
            console.log();

            prompt();
        });
    };

    header('Welcome to .HMAN Terminal Demo');

    log(`
This simulates messaging .HMAN on Signal.

Try these commands:
  ${colors.bold}start${colors.reset}       - Initialize your account
  ${colors.bold}code${colors.reset}        - Generate a session code
  ${colors.bold}status${colors.reset}      - View your sessions
  ${colors.bold}level${colors.reset}       - See your trust level
  ${colors.bold}connect${colors.reset}     - Link a service (upgrade to Level 2)
  ${colors.bold}allow${colors.reset}       - Add auto-approve rule (upgrade to Level 3)
  ${colors.bold}rules${colors.reset}       - View your rules
  ${colors.bold}revoke${colors.reset}      - End all sessions
  ${colors.bold}help${colors.reset}        - Show all commands
  
Type ${colors.bold}quit${colors.reset} or ${colors.bold}exit${colors.reset} to leave.
`, colors.dim);

    console.log();
    prompt();
}

// Handle uncaught errors
process.on('unhandledRejection', (err) => {
    console.error('Error:', err);
    process.exit(1);
});

main().catch(console.error);
