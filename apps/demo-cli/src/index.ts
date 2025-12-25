#!/usr/bin/env node
/**
 * HMAN Demo CLI
 *
 * Interactive demonstration of HMAN core functionality:
 * - Vault creation and encryption
 * - Permission levels
 * - Access control gate
 * - Audit logging
 */

import { writeFileSync } from 'fs';
import {
  createHmanSDK,
  VaultType,
  getHmanExportFilename,
  HmanFileType,
  type AccessRequest,
  type AccessResponse,
  type TransactionContent,
  type DiaryEntryContent,
  type ProfileContent,
  type ContactMethod,
} from '@hman/core';

// ANSI color codes
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

function subheader(title: string): void {
  console.log('');
  log(`▶ ${title}`, 'yellow');
  log('─'.repeat(40), 'dim');
}

function success(message: string): void {
  log(`✓ ${message}`, 'green');
}

function info(message: string): void {
  log(`ℹ ${message}`, 'blue');
}

function warn(message: string): void {
  log(`⚠ ${message}`, 'yellow');
}

// Simulated access request handler (auto-approves for demo)
async function handleAccessRequest(request: AccessRequest): Promise<AccessResponse | null> {
  console.log('');
  log('┌─────────────────────────────────────────────────────┐', 'magenta');
  log('│  🔐 SIMULATED ACCESS REQUEST                        │', 'magenta');
  log('├─────────────────────────────────────────────────────┤', 'magenta');
  log(`│  Requester: ${request.requester.name.padEnd(38)}│`, 'magenta');
  log(`│  Resource:  ${request.resource.uri.padEnd(38)}│`, 'magenta');
  log(`│  Purpose:   ${request.purpose.slice(0, 38).padEnd(38)}│`, 'magenta');
  log('├─────────────────────────────────────────────────────┤', 'magenta');
  log('│  Auto-approving for demo...                         │', 'magenta');
  log('└─────────────────────────────────────────────────────┘', 'magenta');
  console.log('');

  // Simulate user thinking
  await new Promise(resolve => setTimeout(resolve, 500));

  return {
    decision: 'allow_once',
    respondedBy: 'demo-user',
    respondedAt: new Date(),
  };
}

async function handleAccessNotification(request: AccessRequest): Promise<void> {
  info(`[Notification] ${request.requester.name} accessed ${request.resource.uri}`);
}

async function main(): Promise<void> {
  header('HMAN Demo - Human Managed Access Network');

  log('This demo showcases the core HMAN functionality:', 'dim');
  log('  • Encrypted vault creation', 'dim');
  log('  • Tiered permission levels (Open, Standard, Gated, Locked)', 'dim');
  log('  • Access control with human-in-the-loop', 'dim');
  log('  • Audit logging with integrity verification', 'dim');
  console.log('');

  // Initialize SDK
  subheader('Initializing HMAN SDK');

  const passphrase = 'demo-secure-passphrase-2024';
  info(`Using passphrase: ${passphrase.slice(0, 8)}...`);

  const sdk = await createHmanSDK({
    accessRequestHandler: handleAccessRequest,
    accessNotificationHandler: handleAccessNotification,
  });

  await sdk.initialize(passphrase);
  success('SDK initialized with encrypted vaults');

  // List vaults
  subheader('Available Vaults');

  const vaults = await sdk.vaultManager.getAllVaults();
  for (const vault of vaults) {
    const levelName = ['Open', 'Standard', 'Gated', 'Locked'][vault.defaultPermissionLevel];
    log(`  📁 ${vault.name.padEnd(12)} │ ${vault.type.padEnd(10)} │ Level: ${levelName}`, 'cyan');
  }

  // Add data to vaults
  subheader('Adding Data to Vaults');

  // Identity vault (Open - Level 0)
  // Creating personalized profile with Signal as primary contact
  const contactMethods: ContactMethod[] = [
    {
      platform: 'signal',
      identifier: '+61420309085',
      isPrimary: true,
      isVerified: false,
      label: 'Personal',
    },
    {
      platform: 'sms',
      identifier: '+61420309085',
      isPrimary: false,
      label: 'Mobile',
    },
  ];

  const profileId = await sdk.addToVault<ProfileContent>(
    VaultType.Identity,
    'profile',
    'My Profile',
    {
      displayName: 'HMAN Pioneer',
      phone: '+61420309085',
      languagePreference: 'en-AU',
      timezone: 'Australia/Sydney',
      contactMethods,
      bio: 'First HMAN user - pioneering sovereign digital identity.',
    }
  );
  success(`Added profile to Identity vault (ID: ${profileId.slice(0, 8)}...)`);
  info(`Primary contact: Signal (+61420309085)`);

  // Finance vault (Gated - Level 2)
  const txId1 = await sdk.addToVault<TransactionContent>(
    VaultType.Finance,
    'transaction',
    'Electric Bill',
    {
      type: 'expense',
      amount: 156.32,
      currency: 'AUD',
      category: 'utilities',
      subcategory: 'electricity',
      merchant: 'Energy Australia',
      date: '2024-01-15',
    }
  );
  success(`Added transaction to Finance vault (ID: ${txId1.slice(0, 8)}...)`);

  const txId2 = await sdk.addToVault<TransactionContent>(
    VaultType.Finance,
    'transaction',
    'Grocery Shopping',
    {
      type: 'expense',
      amount: 127.85,
      currency: 'AUD',
      category: 'groceries',
      merchant: 'Woolworths',
      date: '2024-01-16',
    }
  );
  success(`Added transaction to Finance vault (ID: ${txId2.slice(0, 8)}...)`);

  // Diary vault (Standard - Level 1)
  const diaryId = await sdk.addToVault<DiaryEntryContent>(
    VaultType.Diary,
    'entry',
    'Great day',
    {
      date: '2024-01-16',
      mood: 'happy',
      content: 'Had a productive day working on the HMAN platform!',
      tags: ['work', 'hman', 'productive'],
    }
  );
  success(`Added entry to Diary vault (ID: ${diaryId.slice(0, 8)}...)`);

  // Test access control
  header('Testing Access Control');

  const aiRequester = {
    id: 'claude-demo',
    type: 'ai_model' as const,
    name: 'Claude (Demo)',
    metadata: { modelId: 'claude-3-opus' },
  };

  // Test Level 0 (Open) - should auto-approve
  subheader('Test 1: Open Resource (Auto-approve)');
  info('Requesting: hman://identity/profile');

  const decision1 = await sdk.gate.requestAccess(
    aiRequester,
    'hman://identity/profile',
    'Display user greeting'
  );

  log(`  Result: ${decision1.granted ? 'GRANTED' : 'DENIED'}`, decision1.granted ? 'green' : 'red');
  log(`  Method: ${decision1.method}`, 'dim');

  // Test Level 1 (Standard) - should auto-approve with notification
  subheader('Test 2: Standard Resource (Auto-approve with notification)');
  info('Requesting: hman://diary/entries');

  const decision2 = await sdk.gate.requestAccess(
    aiRequester,
    'hman://diary/entries',
    'Summarize recent journal entries'
  );

  log(`  Result: ${decision2.granted ? 'GRANTED' : 'DENIED'}`, decision2.granted ? 'green' : 'red');
  log(`  Method: ${decision2.method}`, 'dim');

  // Test Level 2 (Gated) - requires explicit approval
  subheader('Test 3: Gated Resource (Requires user approval)');
  info('Requesting: hman://finance/transactions');

  const decision3 = await sdk.gate.requestAccess(
    aiRequester,
    'hman://finance/transactions',
    'Analyze spending patterns'
  );

  log(`  Result: ${decision3.granted ? 'GRANTED' : 'DENIED'}`, decision3.granted ? 'green' : 'red');
  log(`  Method: ${decision3.method}`, 'dim');

  // Test Level 3 (Locked) - should always deny
  subheader('Test 4: Locked Resource (Always denied)');
  info('Requesting: hman://secrets/passwords');

  const decision4 = await sdk.gate.requestAccess(
    aiRequester,
    'hman://secrets/passwords',
    'Retrieve password for website'
  );

  log(`  Result: ${decision4.granted ? 'GRANTED' : 'DENIED'}`, decision4.granted ? 'green' : 'red');
  log(`  Method: ${decision4.method}`, 'dim');
  if (decision4.denialReason) {
    log(`  Reason: ${decision4.denialReason}`, 'yellow');
  }

  // Show audit log
  header('Audit Log');

  const auditEntries = await sdk.auditLogger.query({
    limit: 10,
    sortOrder: 'desc',
  });

  info(`Total entries: ${auditEntries.length}`);
  console.log('');

  for (const entry of auditEntries) {
    const symbol = entry.outcome.success ? '✓' : '✗';
    const color = entry.outcome.success ? 'green' : 'red';
    const time = entry.timestamp.toLocaleTimeString();

    log(`  ${symbol} [${time}] ${entry.action.padEnd(18)} │ ${entry.resource.uri.padEnd(30)} │ ${entry.actor.name}`, color);
  }

  // Verify audit log integrity
  subheader('Audit Log Integrity Check');

  const integrityResult = await sdk.auditLogger.verifyIntegrity(auditEntries);
  if (integrityResult.valid) {
    success('Audit log integrity verified - no tampering detected');
  } else {
    warn('Audit log integrity check failed!');
    for (const error of integrityResult.errors) {
      log(`  - ${error}`, 'red');
    }
  }

  // Export to .hman file
  header('Creating Your First .hman File');

  log('Exporting your Identity vault to .hman format...', 'dim');
  console.log('');

  const exportBuffer = await sdk.exportVault(VaultType.Identity, {
    compress: true,
  });

  const filename = getHmanExportFilename(HmanFileType.VaultExport, 'my-first-identity');
  writeFileSync(filename, exportBuffer);

  success(`Exported to: ${filename}`);
  info(`File size: ${(exportBuffer.length / 1024).toFixed(2)} KB`);
  console.log('');

  log('Your .hman file contains:', 'cyan');
  log('  📋 Profile: HMAN Pioneer', 'cyan');
  log('  📱 Signal: +61420309085 (Primary)', 'cyan');
  log('  🌏 Timezone: Australia/Sydney', 'cyan');
  log('  🔐 Encrypted & compressed with gzip', 'cyan');
  console.log('');

  // Summary
  header('Demo Complete');

  log('HMAN demonstrated:', 'bright');
  log('  ✓ Zero-access encryption (all data encrypted with user passphrase)', 'green');
  log('  ✓ Tiered permissions (Open, Standard, Gated, Locked)', 'green');
  log('  ✓ Human-in-the-loop access control for sensitive data', 'green');
  log('  ✓ Integrity-verified audit logging', 'green');
  log('  ✓ .hman file format for portable encrypted exports', 'green');
  console.log('');

  log('Next steps:', 'yellow');
  log('  • Connect Claude Desktop via MCP: pnpm dev:mcp', 'dim');
  log('  • Build mobile app with React Native', 'dim');
  log('  • Add E2EE messaging with libsignal', 'dim');
  log('  • Integrate PayID for payments', 'dim');
  console.log('');

  log('📁 Your first .hman file has been created!', 'bright');
  log(`   ${filename}`, 'green');
  console.log('');

  // Lock the SDK
  sdk.lock();
  info('SDK locked - keys wiped from memory');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
