/**
 * Gate (Access Control) Tests
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { VaultType, PermissionLevel, type AccessRequest, type AccessResponse } from '@hman/shared';
import { initCrypto } from '../crypto/encryption.js';
import { createKeyManager, KeyManager } from '../crypto/keys.js';
import { VaultManager } from '../vault/vault-manager.js';
import { MemoryVaultStorage } from '../vault/memory-storage.js';
import { AuditLogger, MemoryAuditStorage } from '../audit/audit-log.js';
import { Gate } from '../access/gate.js';

describe('Gate (Access Control)', () => {
  let keyManager: KeyManager;
  let vaultStorage: MemoryVaultStorage;
  let vaultManager: VaultManager;
  let auditStorage: MemoryAuditStorage;
  let auditLogger: AuditLogger;
  let gate: Gate;

  const mockRequester = {
    id: 'claude-test',
    type: 'ai_model' as const,
    name: 'Claude',
    metadata: { modelId: 'claude-3-opus' },
  };

  beforeAll(async () => {
    await initCrypto();
  });

  beforeEach(async () => {
    keyManager = await createKeyManager();
    await keyManager.createMasterKey('test-passphrase');

    vaultStorage = new MemoryVaultStorage();
    vaultManager = new VaultManager({ storage: vaultStorage, keyManager });

    auditStorage = new MemoryAuditStorage();
    auditLogger = new AuditLogger(auditStorage);
    await auditLogger.init();

    gate = new Gate({
      vaultManager,
      auditLogger,
      requestTimeoutMs: 1000,
    });

    // Create test vaults
    await vaultManager.createVault(VaultType.Identity, 'Identity');
    await vaultManager.createVault(VaultType.Calendar, 'Calendar');
    await vaultManager.createVault(VaultType.Finance, 'Finance');
    await vaultManager.createVault(VaultType.Secrets, 'Secrets');
  });

  describe('Open Resources (Level 0)', () => {
    it('should auto-approve access to Open resources', async () => {
      const decision = await gate.requestAccess(
        mockRequester,
        'hman://identity/profile',
        'Get user name'
      );

      expect(decision.granted).toBe(true);
      expect(decision.permissionLevel).toBe(PermissionLevel.Open);
      expect(decision.method).toBe('auto');
    });

    it('should log access to Open resources', async () => {
      await gate.requestAccess(mockRequester, 'hman://identity/profile', 'Get user name');

      const entries = await auditLogger.query({ actions: ['access_granted'] });
      expect(entries.length).toBe(1);
    });
  });

  describe('Standard Resources (Level 1)', () => {
    it('should auto-approve access to Standard resources', async () => {
      const decision = await gate.requestAccess(
        mockRequester,
        'hman://calendar/events',
        'Check schedule'
      );

      expect(decision.granted).toBe(true);
      expect(decision.permissionLevel).toBe(PermissionLevel.Standard);
      expect(decision.method).toBe('auto');
    });

    it('should call notification handler for Standard resources', async () => {
      let notified = false;
      const notificationHandler = async (request: AccessRequest) => {
        notified = true;
      };

      const gateWithNotification = new Gate({
        vaultManager,
        auditLogger,
        accessNotificationHandler: notificationHandler,
      });

      await gateWithNotification.requestAccess(
        mockRequester,
        'hman://calendar/events',
        'Check schedule'
      );

      // Give async notification time to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(notified).toBe(true);
    });
  });

  describe('Gated Resources (Level 2)', () => {
    it('should require approval for Gated resources', async () => {
      let requestReceived: AccessRequest | null = null;

      const accessHandler = async (request: AccessRequest): Promise<AccessResponse> => {
        requestReceived = request;
        return {
          decision: 'allow_once',
          respondedBy: 'user',
          respondedAt: new Date(),
        };
      };

      const gateWithHandler = new Gate({
        vaultManager,
        auditLogger,
        accessRequestHandler: accessHandler,
      });

      const decision = await gateWithHandler.requestAccess(
        mockRequester,
        'hman://finance/transactions',
        'Analyze spending'
      );

      expect(requestReceived).toBeTruthy();
      expect(decision.granted).toBe(true);
      expect(decision.method).toBe('user_approved');
    });

    it('should deny access when user denies', async () => {
      const accessHandler = async (request: AccessRequest): Promise<AccessResponse> => {
        return {
          decision: 'deny',
          respondedBy: 'user',
          respondedAt: new Date(),
          reason: 'User declined',
        };
      };

      const gateWithHandler = new Gate({
        vaultManager,
        auditLogger,
        accessRequestHandler: accessHandler,
      });

      const decision = await gateWithHandler.requestAccess(
        mockRequester,
        'hman://finance/transactions',
        'Analyze spending'
      );

      expect(decision.granted).toBe(false);
      expect(decision.method).toBe('denied');
      expect(decision.denialReason).toBe('User declined');
    });

    it('should timeout if no response', async () => {
      const accessHandler = async (request: AccessRequest): Promise<AccessResponse | null> => {
        // Never respond
        await new Promise(resolve => setTimeout(resolve, 5000));
        return null;
      };

      const gateWithHandler = new Gate({
        vaultManager,
        auditLogger,
        accessRequestHandler: accessHandler,
        requestTimeoutMs: 100, // Very short timeout
      });

      const decision = await gateWithHandler.requestAccess(
        mockRequester,
        'hman://finance/transactions',
        'Analyze spending'
      );

      expect(decision.granted).toBe(false);
      expect(decision.denialReason).toContain('timed out');
    });

    it('should cache timed approvals', async () => {
      const expiresAt = new Date(Date.now() + 60000);
      let callCount = 0;

      const accessHandler = async (request: AccessRequest): Promise<AccessResponse> => {
        callCount++;
        return {
          decision: 'allow_timed',
          respondedBy: 'user',
          respondedAt: new Date(),
          expiresAt,
        };
      };

      const gateWithHandler = new Gate({
        vaultManager,
        auditLogger,
        accessRequestHandler: accessHandler,
      });

      // First request - should call handler
      await gateWithHandler.requestAccess(
        mockRequester,
        'hman://finance/transactions',
        'First request'
      );

      // Second request - should use cache
      const decision2 = await gateWithHandler.requestAccess(
        mockRequester,
        'hman://finance/transactions',
        'Second request'
      );

      expect(callCount).toBe(1);
      expect(decision2.granted).toBe(true);
      expect(decision2.method).toBe('auto'); // From cache
    });
  });

  describe('Locked Resources (Level 3)', () => {
    it('should always deny access to Locked resources', async () => {
      const decision = await gate.requestAccess(
        mockRequester,
        'hman://secrets/passwords',
        'Get password'
      );

      expect(decision.granted).toBe(false);
      expect(decision.permissionLevel).toBe(PermissionLevel.Locked);
      expect(decision.method).toBe('locked');
    });

    it('should not call handler for Locked resources', async () => {
      let handlerCalled = false;

      const accessHandler = async (request: AccessRequest): Promise<AccessResponse> => {
        handlerCalled = true;
        return { decision: 'allow_once', respondedBy: 'user', respondedAt: new Date() };
      };

      const gateWithHandler = new Gate({
        vaultManager,
        auditLogger,
        accessRequestHandler: accessHandler,
      });

      await gateWithHandler.requestAccess(
        mockRequester,
        'hman://secrets/passwords',
        'Get password'
      );

      expect(handlerCalled).toBe(false);
    });
  });

  describe('Approval Revocation', () => {
    it('should revoke an approval', async () => {
      const accessHandler = async (): Promise<AccessResponse> => ({
        decision: 'allow_timed',
        respondedBy: 'user',
        respondedAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
      });

      const gateWithHandler = new Gate({
        vaultManager,
        auditLogger,
        accessRequestHandler: accessHandler,
      });

      await gateWithHandler.requestAccess(
        mockRequester,
        'hman://finance/transactions',
        'Request'
      );

      const revoked = gateWithHandler.revokeApproval(
        mockRequester.id,
        'hman://finance/transactions'
      );

      expect(revoked).toBe(true);
    });

    it('should revoke all approvals for a requester', async () => {
      const accessHandler = async (): Promise<AccessResponse> => ({
        decision: 'allow_timed',
        respondedBy: 'user',
        respondedAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
      });

      const gateWithHandler = new Gate({
        vaultManager,
        auditLogger,
        accessRequestHandler: accessHandler,
      });

      await gateWithHandler.requestAccess(mockRequester, 'hman://finance/transactions', 'R1');
      await gateWithHandler.requestAccess(mockRequester, 'hman://finance/bills', 'R2');

      const count = gateWithHandler.revokeAllApprovals(mockRequester.id);

      expect(count).toBe(2);
    });
  });

  describe('Invalid URIs', () => {
    it('should deny access to invalid URIs', async () => {
      const decision = await gate.requestAccess(
        mockRequester,
        'invalid://not-hman',
        'Bad request'
      );

      expect(decision.granted).toBe(false);
      expect(decision.denialReason).toContain('Invalid');
    });

    it('should deny access to non-existent vaults', async () => {
      const decision = await gate.requestAccess(
        mockRequester,
        'hman://nonexistent/data',
        'Bad request'
      );

      expect(decision.granted).toBe(false);
      expect(decision.denialReason).toContain('not found');
    });
  });
});
