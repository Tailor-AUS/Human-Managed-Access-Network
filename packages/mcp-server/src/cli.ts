#!/usr/bin/env node
/**
 * HMAN Gate CLI
 *
 * Runs the HMAN Gate MCP server for integration with Claude and other AI models.
 */

import { HmanGate } from './server.js';
import { VaultType, type AccessRequest, type AccessResponse } from '@hman/core';
import * as readline from 'readline';

// Simple CLI access request handler
async function handleAccessRequest(request: AccessRequest): Promise<AccessResponse | null> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    console.error('\n');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('🔐 ACCESS REQUEST');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(`Requester: ${request.requester.name} (${request.requester.type})`);
    console.error(`Resource:  ${request.resource.uri}`);
    console.error(`Purpose:   ${request.purpose}`);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('[a] Allow once');
    console.error('[t] Allow for 1 hour');
    console.error('[d] Deny');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    rl.question('Your choice: ', (answer) => {
      rl.close();

      const now = new Date();
      switch (answer.toLowerCase()) {
        case 'a':
          resolve({
            decision: 'allow_once',
            respondedBy: 'user',
            respondedAt: now,
          });
          break;
        case 't':
          resolve({
            decision: 'allow_timed',
            respondedBy: 'user',
            respondedAt: now,
            expiresAt: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour
          });
          break;
        default:
          resolve({
            decision: 'deny',
            respondedBy: 'user',
            respondedAt: now,
            reason: 'User denied access',
          });
          break;
      }
    });
  });
}

async function handleAccessNotification(request: AccessRequest): Promise<void> {
  console.error('\n');
  console.error('ℹ️  ACCESS NOTIFICATION');
  console.error(`   ${request.requester.name} accessed ${request.resource.uri}`);
  console.error(`   Purpose: ${request.purpose}`);
}

async function main(): Promise<void> {
  console.error('');
  console.error('╔═══════════════════════════════════════════════════╗');
  console.error('║     HMAN Gate - Human Managed Access Network      ║');
  console.error('║         MCP Server for AI Access Control          ║');
  console.error('╚═══════════════════════════════════════════════════╝');
  console.error('');

  // Get passphrase from environment or use demo passphrase
  const passphrase = process.env.HMAN_PASSPHRASE ?? 'demo-passphrase-change-me';

  if (!process.env.HMAN_PASSPHRASE) {
    console.error('⚠️  Using demo passphrase. Set HMAN_PASSPHRASE for production use.');
    console.error('');
  }

  // Create and initialize the gate
  const gate = new HmanGate({
    name: 'hman-gate',
    version: '0.1.0',
    onAccessRequest: handleAccessRequest,
    onAccessNotification: handleAccessNotification,
  });

  await gate.initialize(passphrase);

  // Set default requester (Claude via MCP)
  gate.setRequester({
    id: 'claude-mcp',
    type: 'ai_model',
    name: 'Claude',
    metadata: {
      modelId: 'claude-3-opus',
    },
  });

  // Add some demo data
  const sdk = gate.getSDK();
  if (sdk) {
    console.error('📦 Adding demo data to vaults...');

    // Add profile
    await sdk.addToVault(VaultType.Identity, 'profile', 'My Profile', {
      displayName: 'Demo User',
      email: 'demo@hman.network',
      languagePreference: 'en',
      timezone: 'Australia/Sydney',
    });

    // Add some transactions
    await sdk.addToVault(VaultType.Finance, 'transaction', 'Electric Bill Payment', {
      type: 'expense',
      amount: 156.32,
      currency: 'AUD',
      category: 'utilities',
      subcategory: 'electricity',
      merchant: 'Energy Australia',
      date: new Date().toISOString(),
    });

    await sdk.addToVault(VaultType.Finance, 'transaction', 'Grocery Shopping', {
      type: 'expense',
      amount: 87.50,
      currency: 'AUD',
      category: 'groceries',
      merchant: 'Woolworths',
      date: new Date().toISOString(),
    });

    // Add a diary entry
    await sdk.addToVault(VaultType.Diary, 'entry', 'Today', {
      date: new Date().toISOString(),
      content: 'Started testing the HMAN platform today. Exciting!',
      mood: 'excited',
      tags: ['hman', 'testing'],
    });

    // Add a calendar event
    await sdk.addToVault(VaultType.Calendar, 'event', 'Team Meeting', {
      title: 'Team Meeting',
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
      description: 'Weekly sync',
      location: 'Zoom',
    });

    console.error('✅ Demo data loaded');
    console.error('');
  }

  console.error('🚀 Starting MCP server...');
  console.error('   Connect Claude Desktop or another MCP client to this server.');
  console.error('');

  await gate.run();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
