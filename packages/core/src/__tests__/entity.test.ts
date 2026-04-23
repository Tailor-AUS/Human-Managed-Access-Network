/**
 * EntityManager tests — multi-entity model (PROTOCOL.md § Multi-Entity Model).
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import {
  EntityStatus,
  ReceptivityChannel,
  DEFAULT_PERSONAL_ENTITY_NAME,
  VaultType,
  type PayIDNomination,
  type ReceptivityPolicy,
} from '@hman/shared';
import { initCrypto } from '../crypto/encryption.js';
import { createKeyManager, KeyManager } from '../crypto/keys.js';
import { VaultManager } from '../vault/vault-manager.js';
import { MemoryVaultStorage } from '../vault/memory-storage.js';
import { EntityManager, EntityErrorCode } from '../entity/entity-manager.js';
import { MemoryEntityStorage } from '../entity/memory-storage.js';
import { migrateToMultiEntity } from '../entity/migrate.js';
import { canonicalJsonBytes } from '../entity/entity-manager.js';
import { verifyDetachedEd25519 } from '../entity/entity-keys.js';

describe('EntityManager', () => {
  let keyManager: KeyManager;
  let storage: MemoryEntityStorage;
  let entityManager: EntityManager;

  beforeAll(async () => {
    await initCrypto();
  });

  beforeEach(async () => {
    keyManager = await createKeyManager();
    await keyManager.createMasterKey('test-passphrase');
    storage = new MemoryEntityStorage();
    entityManager = new EntityManager({
      storage,
      keyManager,
      memberId: 'member-test',
    });
  });

  describe('createEntity', () => {
    it('creates an entity with a signing keypair', async () => {
      const e = await entityManager.createEntity({ display_name: 'Personal' });

      expect(e.id).toBeTruthy();
      expect(e.member_id).toBe('member-test');
      expect(e.display_name).toBe('Personal');
      expect(e.key_pub).toBeTruthy();
      expect(e.status).toBe(EntityStatus.Active);
      expect(keyManager.hasEntityKey(e.id)).toBe(true);
    });

    it('persists the encrypted signing key', async () => {
      const e = await entityManager.createEntity({ display_name: 'Trade' });
      const rec = await storage.getEntityKey(e.id);

      expect(rec).not.toBeNull();
      expect(rec!.entity_id).toBe(e.id);
      expect(rec!.public_key).toBe(e.key_pub);
      expect(rec!.encrypted_secret_key).toBeTruthy();
      expect(rec!.nonce).toBeTruthy();
    });

    it('uses the default receptivity policy when none supplied', async () => {
      const e = await entityManager.createEntity({ display_name: 'Default' });
      expect(e.receptivity_policy.default_channel).toBe(ReceptivityChannel.Confirm);
      expect(e.receptivity_policy.rules).toEqual([]);
    });

    it('rejects empty display names', async () => {
      await expect(entityManager.createEntity({ display_name: '' })).rejects.toMatchObject({
        code: EntityErrorCode.InvalidInput,
      });
    });

    it('requires an unlocked key manager', async () => {
      keyManager.lock();
      await expect(entityManager.createEntity({ display_name: 'x' })).rejects.toMatchObject({
        code: EntityErrorCode.KeyManagerLocked,
      });
    });
  });

  describe('lifecycle', () => {
    it('supports suspend, activate, archive', async () => {
      const e = await entityManager.createEntity({ display_name: 'Lifecycle' });

      const suspended = await entityManager.suspend(e.id);
      expect(suspended.status).toBe(EntityStatus.Suspended);

      const activated = await entityManager.activate(e.id);
      expect(activated.status).toBe(EntityStatus.Active);

      const archived = await entityManager.archive(e.id);
      expect(archived.status).toBe(EntityStatus.Archived);
    });

    it('deleteEntity removes record, key, and wipes in-memory secret', async () => {
      const e = await entityManager.createEntity({ display_name: 'DeleteMe' });
      expect(keyManager.hasEntityKey(e.id)).toBe(true);

      await entityManager.deleteEntity(e.id);

      expect(await entityManager.getEntity(e.id)).toBeNull();
      expect(await storage.getEntityKey(e.id)).toBeNull();
      expect(keyManager.hasEntityKey(e.id)).toBe(false);
    });
  });

  describe('updateEntity', () => {
    it('merges patches', async () => {
      const e = await entityManager.createEntity({ display_name: 'Old' });

      const rail: PayIDNomination = {
        rail: 'payid',
        alias: '+61400000000',
        aliasType: 'phone',
      };
      const policy: ReceptivityPolicy = {
        default_channel: ReceptivityChannel.Whisper,
        rules: [],
      };
      const updated = await entityManager.updateEntity(e.id, {
        display_name: 'New',
        nominated_rails: [rail],
        receptivity_policy: policy,
      });

      expect(updated.display_name).toBe('New');
      expect(updated.nominated_rails).toEqual([rail]);
      expect(updated.receptivity_policy.default_channel).toBe(ReceptivityChannel.Whisper);
      expect(new Date(updated.updated_at).getTime()).toBeGreaterThanOrEqual(
        new Date(e.updated_at).getTime()
      );
    });

    it('getEntityByName returns the updated display name', async () => {
      const e = await entityManager.createEntity({ display_name: 'First' });
      await entityManager.updateEntity(e.id, { display_name: 'Second' });
      const byName = await entityManager.getEntityByName('Second');
      expect(byName?.id).toBe(e.id);
    });
  });

  describe('vault scope', () => {
    it('attaches and detaches vault ids idempotently', async () => {
      const e = await entityManager.createEntity({ display_name: 'Scoped' });

      await entityManager.attachVault(e.id, 'vault-a');
      await entityManager.attachVault(e.id, 'vault-a'); // idempotent
      await entityManager.attachVault(e.id, 'vault-b');

      let scope = await entityManager.listVaultIds(e.id);
      expect(scope.sort()).toEqual(['vault-a', 'vault-b']);

      await entityManager.detachVault(e.id, 'vault-a');
      scope = await entityManager.listVaultIds(e.id);
      expect(scope).toEqual(['vault-b']);
    });
  });

  describe('sign / verify', () => {
    it('signs a message and verifies it with the public key', async () => {
      const e = await entityManager.createEntity({ display_name: 'Signer' });

      const message = sodium.from_string('hello from the cafe');
      const sig = await entityManager.sign(e.id, message);

      const ok = await entityManager.verify(e.id, message, sig);
      expect(ok).toBe(true);
    });

    it('rejects a tampered message', async () => {
      const e = await entityManager.createEntity({ display_name: 'Signer' });
      const sig = await entityManager.sign(e.id, sodium.from_string('original'));
      const ok = await entityManager.verify(e.id, sodium.from_string('tampered'), sig);
      expect(ok).toBe(false);
    });

    it('verify against the stored public key works without the secret in memory', async () => {
      const e = await entityManager.createEntity({ display_name: 'Signer' });
      const sig = await entityManager.sign(e.id, sodium.from_string('bytes'));

      // drop the secret from memory — verify must still succeed using key_pub
      keyManager.unloadEntityKey(e.id);
      expect(keyManager.hasEntityKey(e.id)).toBe(false);

      const ok = await entityManager.verify(e.id, sodium.from_string('bytes'), sig);
      expect(ok).toBe(true);
    });

    it('raw verifyDetachedEd25519 matches EntityManager.verify', async () => {
      const e = await entityManager.createEntity({ display_name: 'Signer' });
      const msg = canonicalJsonBytes({ foo: 'bar', n: 3 });
      const sig = await entityManager.sign(e.id, msg);

      expect(verifyDetachedEd25519(msg, sig, e.key_pub)).toBe(true);
    });
  });

  describe('lazy key reload', () => {
    it('sign() auto-reloads a key that was unloaded from memory', async () => {
      const e = await entityManager.createEntity({ display_name: 'PersistMe' });
      const msg = sodium.from_string('roundtrip');
      const sig1 = await entityManager.sign(e.id, msg);

      // Evict from the in-memory cache — the encrypted key is still in storage.
      keyManager.unloadEntityKey(e.id);
      expect(keyManager.hasEntityKey(e.id)).toBe(false);

      // Next sign() should auto-reload.
      const sig2 = await entityManager.sign(e.id, msg);
      expect(sig2).toBeTruthy();
      expect(keyManager.hasEntityKey(e.id)).toBe(true);

      // Both signatures verify against the same public key.
      expect(await entityManager.verify(e.id, msg, sig1)).toBe(true);
      expect(await entityManager.verify(e.id, msg, sig2)).toBe(true);
    });

    it('loadAllKeys() hydrates every persisted key at once', async () => {
      const a = await entityManager.createEntity({ display_name: 'A' });
      const b = await entityManager.createEntity({ display_name: 'B' });

      keyManager.unloadEntityKey(a.id);
      keyManager.unloadEntityKey(b.id);
      expect(keyManager.hasEntityKey(a.id)).toBe(false);
      expect(keyManager.hasEntityKey(b.id)).toBe(false);

      await entityManager.loadAllKeys();

      expect(keyManager.hasEntityKey(a.id)).toBe(true);
      expect(keyManager.hasEntityKey(b.id)).toBe(true);
    });
  });
});

describe('migrateToMultiEntity', () => {
  let keyManager: KeyManager;
  let vaultStorage: MemoryVaultStorage;
  let vaultManager: VaultManager;
  let entityStorage: MemoryEntityStorage;
  let entityManager: EntityManager;

  beforeAll(async () => {
    await initCrypto();
  });

  beforeEach(async () => {
    keyManager = await createKeyManager();
    await keyManager.createMasterKey('pp');
    vaultStorage = new MemoryVaultStorage();
    vaultManager = new VaultManager({ storage: vaultStorage, keyManager });
    entityStorage = new MemoryEntityStorage();
    entityManager = new EntityManager({
      storage: entityStorage,
      keyManager,
      memberId: 'member-m',
    });
  });

  it('creates a Personal entity and attaches every unattached vault', async () => {
    await vaultManager.createVault(VaultType.Identity, 'Identity');
    await vaultManager.createVault(VaultType.Calendar, 'Calendar');
    await vaultManager.createVault(VaultType.Finance, 'Finance');

    const result = await migrateToMultiEntity(entityManager, vaultManager);

    expect(result.entityCreated).toBe(true);
    expect(result.personalEntity.display_name).toBe(DEFAULT_PERSONAL_ENTITY_NAME);
    expect(result.vaultsAttached).toBe(3);

    const vaults = await vaultManager.getAllVaults();
    for (const v of vaults) {
      expect(v.entityId).toBe(result.personalEntity.id);
    }
    const ids = await entityManager.listVaultIds(result.personalEntity.id);
    expect(ids.length).toBe(3);
  });

  it('is idempotent — second run attaches nothing new', async () => {
    await vaultManager.createVault(VaultType.Identity, 'Identity');
    const first = await migrateToMultiEntity(entityManager, vaultManager);
    const second = await migrateToMultiEntity(entityManager, vaultManager);

    expect(second.entityCreated).toBe(false);
    expect(second.vaultsAttached).toBe(0);
    expect(second.personalEntity.id).toBe(first.personalEntity.id);
  });

  it('only attaches unattached vaults when some are already scoped', async () => {
    const alreadyScoped = await entityManager.createEntity({ display_name: 'Trade' });

    const identity = await vaultManager.createVault(VaultType.Identity, 'Identity');
    const finance = await vaultManager.createVault(VaultType.Finance, 'Finance');

    // Pre-attach finance to Trade
    await vaultManager.setVaultEntity(finance.id, alreadyScoped.id);
    await entityManager.attachVault(alreadyScoped.id, finance.id);

    const result = await migrateToMultiEntity(entityManager, vaultManager);

    expect(result.vaultsAttached).toBe(1);

    const fresh = await vaultManager.getVault(identity.id);
    expect(fresh?.entityId).toBe(result.personalEntity.id);

    const financeFresh = await vaultManager.getVault(finance.id);
    expect(financeFresh?.entityId).toBe(alreadyScoped.id);
  });
});
