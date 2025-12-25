/**
 * Vault Manager Tests
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { VaultType, PermissionLevel } from '@hman/shared';
import { initCrypto } from '../crypto/encryption.js';
import { createKeyManager, KeyManager } from '../crypto/keys.js';
import { VaultManager } from '../vault/vault-manager.js';
import { MemoryVaultStorage } from '../vault/memory-storage.js';

describe('VaultManager', () => {
  let keyManager: KeyManager;
  let storage: MemoryVaultStorage;
  let vaultManager: VaultManager;

  beforeAll(async () => {
    await initCrypto();
  });

  beforeEach(async () => {
    keyManager = await createKeyManager();
    await keyManager.createMasterKey('test-passphrase');
    storage = new MemoryVaultStorage();
    vaultManager = new VaultManager({ storage, keyManager });
  });

  describe('Vault Creation', () => {
    it('should create a vault', async () => {
      const vault = await vaultManager.createVault(VaultType.Finance, 'My Finance');

      expect(vault.id).toBeTruthy();
      expect(vault.type).toBe(VaultType.Finance);
      expect(vault.name).toBe('My Finance');
      expect(vault.isUnlocked).toBe(true);
    });

    it('should set correct default permission levels', async () => {
      const identity = await vaultManager.createVault(VaultType.Identity, 'Identity');
      const finance = await vaultManager.createVault(VaultType.Finance, 'Finance');
      const secrets = await vaultManager.createVault(VaultType.Secrets, 'Secrets');

      expect(identity.defaultPermissionLevel).toBe(PermissionLevel.Open);
      expect(finance.defaultPermissionLevel).toBe(PermissionLevel.Gated);
      expect(secrets.defaultPermissionLevel).toBe(PermissionLevel.Locked);
    });

    it('should allow custom permission level', async () => {
      const vault = await vaultManager.createVault(VaultType.Custom, 'Custom', {
        defaultPermissionLevel: PermissionLevel.Standard,
      });

      expect(vault.defaultPermissionLevel).toBe(PermissionLevel.Standard);
    });
  });

  describe('Vault Operations', () => {
    it('should get a vault by ID', async () => {
      const created = await vaultManager.createVault(VaultType.Finance, 'Finance');
      const retrieved = await vaultManager.getVault(created.id);

      expect(retrieved).toBeTruthy();
      expect(retrieved!.id).toBe(created.id);
    });

    it('should get all vaults', async () => {
      await vaultManager.createVault(VaultType.Finance, 'Finance');
      await vaultManager.createVault(VaultType.Health, 'Health');

      const vaults = await vaultManager.getAllVaults();

      expect(vaults.length).toBe(2);
    });

    it('should unlock a vault', async () => {
      const vault = await vaultManager.createVault(VaultType.Finance, 'Finance');
      await vaultManager.lockVault(vault.id);

      expect(keyManager.hasVaultKey(vault.id)).toBe(false);

      const unlocked = await vaultManager.unlockVault(vault.id);

      expect(unlocked).toBe(true);
      expect(keyManager.hasVaultKey(vault.id)).toBe(true);
    });

    it('should lock a vault', async () => {
      const vault = await vaultManager.createVault(VaultType.Finance, 'Finance');

      await vaultManager.lockVault(vault.id);

      expect(keyManager.hasVaultKey(vault.id)).toBe(false);
    });

    it('should delete a vault', async () => {
      const vault = await vaultManager.createVault(VaultType.Finance, 'Finance');
      await vaultManager.addItem(vault.id, 'transaction', 'Test', { amount: 100 });

      await vaultManager.deleteVault(vault.id);

      const retrieved = await vaultManager.getVault(vault.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Item Operations', () => {
    let vault: Awaited<ReturnType<typeof vaultManager.createVault>>;

    beforeEach(async () => {
      vault = await vaultManager.createVault(VaultType.Finance, 'Finance');
    });

    it('should add an item to a vault', async () => {
      const item = await vaultManager.addItem(
        vault.id,
        'transaction',
        'Electric Bill',
        { amount: 150, category: 'utilities' }
      );

      expect(item.id).toBeTruthy();
      expect(item.vaultId).toBe(vault.id);
      expect(item.itemType).toBe('transaction');
      expect(item.title).toBe('Electric Bill');
      expect(item.encryptedContent).toBeTruthy();
    });

    it('should get and decrypt an item', async () => {
      const content = { amount: 150, category: 'utilities', merchant: 'Energy Co' };
      const created = await vaultManager.addItem(vault.id, 'transaction', 'Bill', content);

      const item = await vaultManager.getItem<typeof content>(created.id);

      expect(item).toBeTruthy();
      expect(item!.content).toEqual(content);
    });

    it('should update an item', async () => {
      const original = { amount: 150 };
      const updated = { amount: 175, notes: 'Updated' };
      const created = await vaultManager.addItem(vault.id, 'transaction', 'Bill', original);

      await vaultManager.updateItem(created.id, updated);

      const item = await vaultManager.getItem<typeof updated>(created.id);
      expect(item!.content).toEqual(updated);
    });

    it('should get all items in a vault', async () => {
      await vaultManager.addItem(vault.id, 'transaction', 'Item 1', { a: 1 });
      await vaultManager.addItem(vault.id, 'transaction', 'Item 2', { a: 2 });
      await vaultManager.addItem(vault.id, 'transaction', 'Item 3', { a: 3 });

      const items = await vaultManager.getVaultItems(vault.id);

      expect(items.length).toBe(3);
    });

    it('should get items by type', async () => {
      await vaultManager.addItem(vault.id, 'transaction', 'Trans 1', { a: 1 });
      await vaultManager.addItem(vault.id, 'transaction', 'Trans 2', { a: 2 });
      await vaultManager.addItem(vault.id, 'bill', 'Bill 1', { a: 3 });

      const transactions = await vaultManager.getItemsByType(vault.id, 'transaction');
      const bills = await vaultManager.getItemsByType(vault.id, 'bill');

      expect(transactions.length).toBe(2);
      expect(bills.length).toBe(1);
    });

    it('should delete an item', async () => {
      const created = await vaultManager.addItem(vault.id, 'transaction', 'Bill', { a: 1 });

      await vaultManager.deleteItem(created.id);

      const item = await vaultManager.getItem(created.id);
      expect(item).toBeNull();
    });

    it('should set item permission level', async () => {
      const created = await vaultManager.addItem(vault.id, 'transaction', 'Secret', { a: 1 });

      await vaultManager.setItemPermissionLevel(created.id, PermissionLevel.Locked);

      const level = await vaultManager.getItemPermissionLevel(created.id);
      expect(level).toBe(PermissionLevel.Locked);
    });

    it('should use vault default permission if item has none', async () => {
      const created = await vaultManager.addItem(vault.id, 'transaction', 'Normal', { a: 1 });

      const level = await vaultManager.getItemPermissionLevel(created.id);

      expect(level).toBe(vault.defaultPermissionLevel);
    });

    it('should add items with tags', async () => {
      const item = await vaultManager.addItem(
        vault.id,
        'transaction',
        'Tagged Item',
        { a: 1 },
        { tags: ['important', 'work'] }
      );

      expect(item.tags).toEqual(['important', 'work']);
    });

    it('should throw when vault is locked', async () => {
      await vaultManager.lockVault(vault.id);

      await expect(
        vaultManager.addItem(vault.id, 'transaction', 'Test', { a: 1 })
      ).rejects.toThrow();
    });
  });

  describe('Resource URIs', () => {
    it('should generate correct MCP resource URIs', async () => {
      const vault = await vaultManager.createVault(VaultType.Finance, 'Finance');
      const item = await vaultManager.addItem(vault.id, 'transaction', 'Test', { a: 1 });

      expect(item.resourceUri).toMatch(/^hman:\/\/finance\/transaction\/.+$/);
    });
  });
});
