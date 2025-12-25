#!/usr/bin/env node
/**
 * HMAN Signal Setup CLI
 *
 * Set up Signal messaging for HMAN notifications and approvals.
 */

import * as readline from 'readline';
import { createSignalService, SignalService, type SignalMessage } from '@hman/core';

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`${colors.yellow}${question}${colors.reset} `, resolve);
  });
}

async function checkSignalCli(): Promise<boolean> {
  log('Checking for signal-cli installation...', 'dim');

  try {
    const { execSync } = await import('child_process');
    const version = execSync('signal-cli --version', { encoding: 'utf-8' }).trim();
    log(`✓ signal-cli found: ${version}`, 'green');
    return true;
  } catch {
    log('✗ signal-cli not found', 'red');
    console.log('');
    log('To install signal-cli:', 'yellow');
    log('  1. Install Java 17+: sudo apt install openjdk-17-jre', 'dim');
    log('  2. Download signal-cli from: https://github.com/AsamK/signal-cli/releases', 'dim');
    log('  3. Extract and add to PATH', 'dim');
    console.log('');
    log('Or use the quick install script:', 'yellow');
    log('  curl -sSL https://raw.githubusercontent.com/AsamK/signal-cli/master/install.sh | bash', 'dim');
    return false;
  }
}

async function setupNewAccount(signal: SignalService): Promise<boolean> {
  header('Register New Signal Account');

  log('This will register a new Signal account with your phone number.', 'dim');
  log('You will receive an SMS with a verification code.', 'dim');
  console.log('');

  const phoneNumber = await prompt('Enter phone number (E.164 format, e.g., +61420309085):');

  if (!phoneNumber.match(/^\+\d{10,15}$/)) {
    log('Invalid phone number format', 'red');
    return false;
  }

  log('', 'reset');
  log('Requesting verification code...', 'yellow');

  const regResult = await signal.register({ phoneNumber });

  if (!regResult.success) {
    log(`Registration failed: ${regResult.error}`, 'red');
    return false;
  }

  log('✓ Verification code sent via SMS', 'green');
  console.log('');

  const code = await prompt('Enter the verification code:');

  log('Verifying...', 'yellow');
  const verifyResult = await signal.verify(code.replace(/\D/g, ''));

  if (!verifyResult.success) {
    log(`Verification failed: ${verifyResult.error}`, 'red');
    return false;
  }

  log('✓ Account verified and ready!', 'green');
  return true;
}

async function linkDevice(signal: SignalService): Promise<boolean> {
  header('Link as Secondary Device');

  log('This will link HMAN as a secondary device to your existing Signal account.', 'dim');
  log('You will need to scan a QR code from your primary Signal app.', 'dim');
  console.log('');

  log('Generating linking URI...', 'yellow');

  const result = await signal.link('HMAN');

  if (result.uri) {
    console.log('');
    log('Scan this QR code with your Signal app:', 'bright');
    log('(Settings > Linked Devices > Link New Device)', 'dim');
    console.log('');

    // Display the URI (in a real app, you'd show a QR code)
    log('Linking URI:', 'cyan');
    log(result.uri, 'green');
    console.log('');

    // Generate QR code text representation
    log('Or scan this QR code:', 'cyan');
    try {
      const QRCode = await import('qrcode');
      const qr = await QRCode.toString(result.uri, { type: 'terminal', small: true });
      console.log(qr);
    } catch {
      log('(Install qrcode package for QR display: npm i qrcode)', 'dim');
    }

    log('Waiting for link confirmation...', 'yellow');

    // Wait for linking to complete
    if (result.success) {
      log('✓ Successfully linked!', 'green');
      return true;
    }
  }

  log(`Linking failed: ${result.error}`, 'red');
  return false;
}

async function testMessage(signal: SignalService): Promise<void> {
  header('Test Signal Messaging');

  const recipient = await prompt('Enter recipient phone number (E.164 format):');

  log('Sending test message...', 'yellow');

  const result = await signal.sendMessage(
    recipient,
    '🔐 HMAN Signal Test\n\nYour HMAN Signal integration is working!\n\nYou can now receive:\n• Access request notifications\n• Approval requests\n• Secure .hman file transfers'
  );

  if (result.success) {
    log('✓ Message sent successfully!', 'green');
  } else {
    log(`Message failed: ${result.error}`, 'red');
  }
}

async function receiveMessages(signal: SignalService): Promise<void> {
  header('Check Incoming Messages');

  log('Checking for new messages...', 'yellow');

  const messages = await signal.receiveMessages();

  if (messages.length === 0) {
    log('No new messages', 'dim');
    return;
  }

  log(`Found ${messages.length} message(s):`, 'green');
  console.log('');

  for (const msg of messages) {
    log(`From: ${msg.sender}`, 'cyan');
    log(`Time: ${new Date(msg.timestamp).toLocaleString()}`, 'dim');
    log(`Message: ${msg.body}`, 'reset');

    // Check if it's an access response
    const response = signal.parseAccessResponse(msg);
    if (response) {
      log(`→ Access Response: ${response.approved ? 'APPROVED' : 'DENIED'}`, response.approved ? 'green' : 'red');
      if (response.duration) {
        log(`  Duration: ${response.duration / 1000 / 60} minutes`, 'dim');
      }
      if (response.reason) {
        log(`  Reason: ${response.reason}`, 'dim');
      }
    }

    console.log('');
  }
}

async function startDaemon(signal: SignalService): Promise<void> {
  header('Start Message Daemon');

  log('Starting Signal daemon to receive messages in real-time...', 'yellow');
  log('Press Ctrl+C to stop', 'dim');
  console.log('');

  signal.on('message', (msg: SignalMessage) => {
    console.log('');
    log('━━━ New Message ━━━', 'magenta');
    log(`From: ${msg.sender}`, 'cyan');
    log(`Time: ${new Date(msg.timestamp).toLocaleString()}`, 'dim');
    log(`Message: ${msg.body}`, 'reset');

    const response = signal.parseAccessResponse(msg);
    if (response) {
      log(`→ Access Response: ${response.approved ? 'APPROVED' : 'DENIED'}`, response.approved ? 'green' : 'red');
    }
  });

  signal.on('error', (error: Error) => {
    log(`Error: ${error.message}`, 'red');
  });

  signal.on('connected', () => {
    log('✓ Daemon connected', 'green');
  });

  signal.on('disconnected', () => {
    log('Daemon disconnected', 'yellow');
  });

  await signal.startDaemon();

  // Keep running until Ctrl+C
  await new Promise(() => {});
}

async function main(): Promise<void> {
  header('HMAN Signal Setup');

  log('This utility helps you set up Signal messaging for HMAN.', 'dim');
  console.log('');

  // Check signal-cli
  const hasSignalCli = await checkSignalCli();
  if (!hasSignalCli) {
    rl.close();
    process.exit(1);
  }

  console.log('');

  // Get phone number
  const phoneNumber = process.argv[2] || await prompt('Enter your Signal phone number (+61420309085):');
  const signal = createSignalService(phoneNumber || '+61420309085');

  // Check registration status
  const status = await signal.checkInstallation();
  console.log('');

  if (status.registered) {
    log('✓ Signal account is registered and ready', 'green');
  } else {
    log('Signal account needs setup', 'yellow');
    console.log('');

    const choice = await prompt('Choose setup method:\n  1. Register new account (receive SMS)\n  2. Link as secondary device (scan QR)\n\nEnter choice (1/2):');

    if (choice === '1') {
      await setupNewAccount(signal);
    } else {
      await linkDevice(signal);
    }
  }

  // Main menu
  while (true) {
    console.log('');
    log('What would you like to do?', 'bright');
    log('  1. Send test message', 'cyan');
    log('  2. Check incoming messages', 'cyan');
    log('  3. Start message daemon (real-time)', 'cyan');
    log('  4. Exit', 'cyan');
    console.log('');

    const choice = await prompt('Enter choice (1-4):');

    switch (choice) {
      case '1':
        await testMessage(signal);
        break;
      case '2':
        await receiveMessages(signal);
        break;
      case '3':
        await startDaemon(signal);
        break;
      case '4':
        rl.close();
        process.exit(0);
      default:
        log('Invalid choice', 'red');
    }
  }
}

main().catch((error) => {
  console.error('Error:', error);
  rl.close();
  process.exit(1);
});
