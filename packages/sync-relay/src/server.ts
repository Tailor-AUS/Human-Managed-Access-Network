#!/usr/bin/env node
/**
 * HMAN Sync Relay Server
 */

import { SyncRelay } from './relay.js';

const PORT = parseInt(process.env.HMAN_RELAY_PORT ?? '8765', 10);

const relay = new SyncRelay({ port: PORT });

async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║      HMAN Sync Relay - Multi-Device Sync          ║');
  console.log('║         Zero-Knowledge Encrypted Relay            ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('');

  await relay.start();

  // Print stats periodically
  setInterval(() => {
    const stats = relay.getStats();
    console.log(`[Stats] Clients: ${stats.connectedClients}, Users: ${stats.connectedUsers}, Uptime: ${Math.floor(stats.uptime)}s`);
  }, 60000);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await relay.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    await relay.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
