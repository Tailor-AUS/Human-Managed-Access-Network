/**
 * Key Manager Tests
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initCrypto, toBase64 } from '../crypto/encryption.js';
import { KeyManager, createKeyManager } from '../crypto/keys.js';

describe('KeyManager', () => {
  beforeAll(async () => {
    await initCrypto();
  });

  let keyManager: KeyManager;

  beforeEach(async () => {
    keyManager = await createKeyManager();
  });

  describe('Master Key', () => {
    it('should create a master key from passphrase', async () => {
      const masterKeyData = await keyManager.createMasterKey('test-passphrase');

      expect(masterKeyData.salt).toBeTruthy();
      expect(masterKeyData.keyHash).toBeTruthy();
      expect(masterKeyData.config).toBeTruthy();
      expect(keyManager.isUnlocked()).toBe(true);
    });

    it('should unlock with correct passphrase', async () => {
      const masterKeyData = await keyManager.createMasterKey('test-passphrase');
      keyManager.lock();

      expect(keyManager.isUnlocked()).toBe(false);

      const success = await keyManager.unlock('test-passphrase', masterKeyData);

      expect(success).toBe(true);
      expect(keyManager.isUnlocked()).toBe(true);
    });

    it('should fail to unlock with wrong passphrase', async () => {
      const masterKeyData = await keyManager.createMasterKey('test-passphrase');
      keyManager.lock();

      const success = await keyManager.unlock('wrong-passphrase', masterKeyData);

      expect(success).toBe(false);
      expect(keyManager.isUnlocked()).toBe(false);
    });

    it('should lock and wipe keys from memory', async () => {
      await keyManager.createMasterKey('test-passphrase');
      const vaultKeyData = keyManager.createVaultKey('vault-1');

      expect(keyManager.isUnlocked()).toBe(true);
      expect(keyManager.hasVaultKey('vault-1')).toBe(true);

      keyManager.lock();

      expect(keyManager.isUnlocked()).toBe(false);
      expect(keyManager.hasVaultKey('vault-1')).toBe(false);
    });
  });

  describe('Vault Keys', () => {
    beforeEach(async () => {
      await keyManager.createMasterKey('test-passphrase');
    });

    it('should create a vault key', () => {
      const vaultKeyData = keyManager.createVaultKey('vault-1');

      expect(vaultKeyData.vaultId).toBe('vault-1');
      expect(vaultKeyData.encryptedKey).toBeTruthy();
      expect(vaultKeyData.nonce).toBeTruthy();
      expect(keyManager.hasVaultKey('vault-1')).toBe(true);
    });

    it('should get a vault key', () => {
      keyManager.createVaultKey('vault-1');
      const key = keyManager.getVaultKey('vault-1');

      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    it('should throw when getting non-existent vault key', () => {
      expect(() => keyManager.getVaultKey('non-existent')).toThrow();
    });

    it('should load a vault key from encrypted data', async () => {
      const vaultKeyData = keyManager.createVaultKey('vault-1');
      const originalKey = toBase64(keyManager.getVaultKey('vault-1'));

      // Lock and unlock
      keyManager.lock();
      const masterKeyData = await keyManager.createMasterKey('test-passphrase');

      expect(keyManager.hasVaultKey('vault-1')).toBe(false);

      // Load vault key
      keyManager.loadVaultKey(vaultKeyData);

      expect(keyManager.hasVaultKey('vault-1')).toBe(true);
      expect(toBase64(keyManager.getVaultKey('vault-1'))).toBe(originalKey);
    });

    it('should unload a vault key', () => {
      keyManager.createVaultKey('vault-1');
      expect(keyManager.hasVaultKey('vault-1')).toBe(true);

      keyManager.unloadVaultKey('vault-1');
      expect(keyManager.hasVaultKey('vault-1')).toBe(false);
    });
  });

  describe('Passphrase Change', () => {
    it('should change passphrase and re-encrypt vault keys', async () => {
      await keyManager.createMasterKey('old-passphrase');
      const vaultKeyData1 = keyManager.createVaultKey('vault-1');
      const vaultKeyData2 = keyManager.createVaultKey('vault-2');
      const originalKey1 = toBase64(keyManager.getVaultKey('vault-1'));

      const { masterKeyData, vaultKeys } = await keyManager.changePassphrase('new-passphrase');

      // Lock and unlock with new passphrase
      keyManager.lock();
      const success = await keyManager.unlock('new-passphrase', masterKeyData);

      expect(success).toBe(true);

      // Load vault keys with new encrypted data
      for (const vk of vaultKeys) {
        keyManager.loadVaultKey(vk);
      }

      // Vault key should be the same
      expect(toBase64(keyManager.getVaultKey('vault-1'))).toBe(originalKey1);
    });

    it('should fail to unlock with old passphrase after change', async () => {
      await keyManager.createMasterKey('old-passphrase');
      const { masterKeyData } = await keyManager.changePassphrase('new-passphrase');

      keyManager.lock();
      const success = await keyManager.unlock('old-passphrase', masterKeyData);

      expect(success).toBe(false);
    });
  });

  describe('Delegation Keys', () => {
    beforeEach(async () => {
      await keyManager.createMasterKey('test-passphrase');
    });

    it('should create a delegation key', () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      const { delegationKey, metadata } = keyManager.createDelegationKey(
        'vault-1',
        'delegate-user',
        expiresAt
      );

      expect(delegationKey).toBeInstanceOf(Uint8Array);
      expect(delegationKey.length).toBe(32);
      expect(metadata.vaultId).toBe('vault-1');
      expect(metadata.delegateId).toBe('delegate-user');
      expect(metadata.expiresAt).toBe(expiresAt.toISOString());
    });
  });
});
