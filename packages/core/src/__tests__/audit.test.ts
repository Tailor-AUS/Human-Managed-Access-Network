/**
 * Audit Logger Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionLevel } from '@hman/shared';
import { AuditLogger, MemoryAuditStorage } from '../audit/audit-log.js';

describe('AuditLogger', () => {
  let storage: MemoryAuditStorage;
  let logger: AuditLogger;

  beforeEach(async () => {
    storage = new MemoryAuditStorage();
    logger = new AuditLogger(storage);
    await logger.init();
  });

  const mockActor = {
    type: 'ai_model' as const,
    id: 'claude-test',
    name: 'Claude',
    modelId: 'claude-3-opus',
  };

  const mockResource = {
    uri: 'hman://finance/transactions',
    vaultId: 'vault-1',
    permissionLevel: PermissionLevel.Gated,
  };

  describe('Logging', () => {
    it('should log an entry', async () => {
      const entry = await logger.log(
        'access_request',
        mockActor,
        mockResource,
        { success: true }
      );

      expect(entry.id).toBeTruthy();
      expect(entry.action).toBe('access_request');
      expect(entry.actor).toEqual(mockActor);
      expect(entry.resource).toEqual(mockResource);
      expect(entry.outcome.success).toBe(true);
      expect(entry.entryHash).toBeTruthy();
    });

    it('should chain entries with previous hash', async () => {
      const entry1 = await logger.log('access_request', mockActor, mockResource, { success: true });
      const entry2 = await logger.log('access_granted', mockActor, mockResource, { success: true });

      expect(entry2.previousEntryHash).toBe(entry1.entryHash);
    });

    it('should include metadata', async () => {
      const entry = await logger.log(
        'payment_approved',
        mockActor,
        mockResource,
        { success: true },
        { amount: 150, currency: 'AUD' }
      );

      expect(entry.metadata).toEqual({ amount: 150, currency: 'AUD' });
    });
  });

  describe('Convenience Methods', () => {
    it('should log access request', async () => {
      const entry = await logger.logAccessRequest(mockActor, mockResource);

      expect(entry.action).toBe('access_request');
    });

    it('should log access granted', async () => {
      const entry = await logger.logAccessGranted(
        mockActor,
        mockResource,
        'user_approved',
        '1 hour'
      );

      expect(entry.action).toBe('access_granted');
      expect(entry.outcome.approvalMethod).toBe('user_approved');
      expect(entry.outcome.accessDuration).toBe('1 hour');
    });

    it('should log access denied', async () => {
      const entry = await logger.logAccessDenied(mockActor, mockResource, 'User declined');

      expect(entry.action).toBe('access_denied');
      expect(entry.outcome.success).toBe(false);
      expect(entry.outcome.failureReason).toBe('User declined');
    });

    it('should log data read', async () => {
      const entry = await logger.logDataRead(mockActor, mockResource);

      expect(entry.action).toBe('data_read');
    });
  });

  describe('Querying', () => {
    beforeEach(async () => {
      // Add some test entries
      await logger.log('access_request', mockActor, mockResource, { success: true });
      await logger.log('access_granted', mockActor, mockResource, { success: true });
      await logger.log('data_read', mockActor, mockResource, { success: true });
      await logger.log('access_denied', mockActor, mockResource, { success: false });
    });

    it('should query all entries', async () => {
      const entries = await logger.query({});

      expect(entries.length).toBe(4);
    });

    it('should filter by action', async () => {
      const entries = await logger.query({ actions: ['access_granted'] });

      expect(entries.length).toBe(1);
      expect(entries[0].action).toBe('access_granted');
    });

    it('should filter by success', async () => {
      const successes = await logger.query({ successOnly: true });
      const failures = await logger.query({ failureOnly: true });

      expect(successes.length).toBe(3);
      expect(failures.length).toBe(1);
    });

    it('should limit results', async () => {
      const entries = await logger.query({ limit: 2 });

      expect(entries.length).toBe(2);
    });

    it('should paginate with offset', async () => {
      const page1 = await logger.query({ limit: 2, offset: 0 });
      const page2 = await logger.query({ limit: 2, offset: 2 });

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });

  describe('Integrity Verification', () => {
    it('should verify integrity of valid log', async () => {
      await logger.log('access_request', mockActor, mockResource, { success: true });
      await logger.log('access_granted', mockActor, mockResource, { success: true });
      await logger.log('data_read', mockActor, mockResource, { success: true });

      const entries = await logger.query({ sortOrder: 'asc' });
      const result = await logger.verifyIntegrity(entries);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect tampered entries', async () => {
      await logger.log('access_request', mockActor, mockResource, { success: true });
      await logger.log('access_granted', mockActor, mockResource, { success: true });

      const entries = await logger.query({ sortOrder: 'asc' });

      // Tamper with an entry
      entries[0].actor.name = 'Tampered';

      const result = await logger.verifyIntegrity(entries);

      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(entries[0].id);
    });

    it('should detect broken chain', async () => {
      await logger.log('access_request', mockActor, mockResource, { success: true });
      await logger.log('access_granted', mockActor, mockResource, { success: true });
      await logger.log('data_read', mockActor, mockResource, { success: true });

      const entries = await logger.query({ sortOrder: 'asc' });

      // Break the chain
      entries[1].previousEntryHash = 'broken';

      const result = await logger.verifyIntegrity(entries);

      expect(result.valid).toBe(false);
    });
  });

  describe('Summary', () => {
    beforeEach(async () => {
      const now = new Date();
      await logger.log('access_request', mockActor, mockResource, { success: true });
      await logger.log('access_granted', mockActor, mockResource, { success: true });
      await logger.log('data_read', mockActor, mockResource, { success: true });
      await logger.log('access_denied', { ...mockActor, id: 'other' }, mockResource, { success: false });
    });

    it('should generate summary', async () => {
      const startTime = new Date(Date.now() - 60000);
      const endTime = new Date(Date.now() + 60000);

      const summary = await logger.getSummary(startTime, endTime);

      expect(summary.totalActions).toBe(4);
      expect(summary.successCount).toBe(3);
      expect(summary.failureCount).toBe(1);
      expect(summary.topActors.length).toBeGreaterThan(0);
      expect(summary.topResources.length).toBeGreaterThan(0);
    });
  });
});
