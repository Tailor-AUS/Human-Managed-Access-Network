/**
 * HMAN SDK - High-level API for common operations
 */

import { VaultType, PermissionLevel } from '@hman/shared';
import { createKeyManager, KeyManager, type MasterKeyData } from './crypto/index.js';
import { VaultManager, MemoryVaultStorage, type VaultStorage } from './vault/index.js';
import { AuditLogger, MemoryAuditStorage, type AuditStorage } from './audit/index.js';
import { Gate, type AccessRequestHandler, type AccessNotificationHandler } from './access/index.js';

export interface HmanSDKConfig {
  /** Custom vault storage (defaults to in-memory) */
  vaultStorage?: VaultStorage;
  /** Custom audit storage (defaults to in-memory) */
  auditStorage?: AuditStorage;
  /** Handler for gated access requests */
  accessRequestHandler?: AccessRequestHandler;
  /** Handler for access notifications */
  accessNotificationHandler?: AccessNotificationHandler;
}

/**
 * HMAN SDK - the main entry point for using HMAN
 */
export class HmanSDK {
  readonly keyManager: KeyManager;
  readonly vaultManager: VaultManager;
  readonly auditLogger: AuditLogger;
  readonly gate: Gate;

  private masterKeyData: MasterKeyData | null = null;

  constructor(
    keyManager: KeyManager,
    vaultManager: VaultManager,
    auditLogger: AuditLogger,
    gate: Gate
  ) {
    this.keyManager = keyManager;
    this.vaultManager = vaultManager;
    this.auditLogger = auditLogger;
    this.gate = gate;
  }

  /**
   * Initialize a new HMAN instance with a passphrase
   * Creates the master key and default vaults
   */
  async initialize(passphrase: string): Promise<void> {
    // Create master key
    this.masterKeyData = await this.keyManager.createMasterKey(passphrase);

    // Create default vaults
    await this.vaultManager.createVault(VaultType.Identity, 'Identity', {
      description: 'Personal identity information',
      defaultPermissionLevel: PermissionLevel.Open,
    });

    await this.vaultManager.createVault(VaultType.Calendar, 'Calendar', {
      description: 'Calendar events and appointments',
      defaultPermissionLevel: PermissionLevel.Standard,
    });

    await this.vaultManager.createVault(VaultType.Diary, 'Diary', {
      description: 'Personal journal and notes',
      defaultPermissionLevel: PermissionLevel.Standard,
    });

    await this.vaultManager.createVault(VaultType.Finance, 'Finance', {
      description: 'Financial transactions and bills',
      defaultPermissionLevel: PermissionLevel.Gated,
    });

    await this.vaultManager.createVault(VaultType.Health, 'Health', {
      description: 'Health records and medical information',
      defaultPermissionLevel: PermissionLevel.Gated,
    });

    await this.vaultManager.createVault(VaultType.Secrets, 'Secrets', {
      description: 'Passwords, keys, and sensitive data',
      defaultPermissionLevel: PermissionLevel.Locked,
    });

    // Initialize audit logger
    await this.auditLogger.init();
  }

  /**
   * Unlock with an existing passphrase
   */
  async unlock(passphrase: string, masterKeyData: MasterKeyData): Promise<boolean> {
    const success = await this.keyManager.unlock(passphrase, masterKeyData);
    if (success) {
      this.masterKeyData = masterKeyData;
      await this.auditLogger.init();
    }
    return success;
  }

  /**
   * Lock the SDK (wipe keys from memory)
   */
  lock(): void {
    this.keyManager.lock();
  }

  /**
   * Check if unlocked
   */
  isUnlocked(): boolean {
    return this.keyManager.isUnlocked();
  }

  /**
   * Get the master key data (for persistence)
   */
  getMasterKeyData(): MasterKeyData | null {
    return this.masterKeyData;
  }

  /**
   * Get a vault by type
   */
  async getVaultByType(type: VaultType): Promise<Awaited<ReturnType<typeof this.vaultManager.getAllVaults>>[0] | null> {
    const vaults = await this.vaultManager.getAllVaults();
    return vaults.find(v => v.type === type) ?? null;
  }

  /**
   * Quick access to add data to a vault
   */
  async addToVault<T>(
    vaultType: VaultType,
    itemType: string,
    title: string,
    content: T,
    options?: { permissionLevel?: PermissionLevel; tags?: string[] }
  ): Promise<string> {
    const vault = await this.getVaultByType(vaultType);
    if (!vault) {
      throw new Error(`Vault not found: ${vaultType}`);
    }

    await this.vaultManager.unlockVault(vault.id);
    const item = await this.vaultManager.addItem(vault.id, itemType, title, content, options);
    return item.id;
  }

  /**
   * Quick access to read data from a vault
   */
  async readFromVault<T>(
    vaultType: VaultType,
    itemId: string
  ): Promise<T | null> {
    const vault = await this.getVaultByType(vaultType);
    if (!vault) {
      throw new Error(`Vault not found: ${vaultType}`);
    }

    await this.vaultManager.unlockVault(vault.id);
    const item = await this.vaultManager.getItem<T>(itemId);
    return item?.content ?? null;
  }
}

/**
 * Create and initialize an HMAN SDK instance
 */
export async function createHmanSDK(config: HmanSDKConfig = {}): Promise<HmanSDK> {
  // Create key manager
  const keyManager = await createKeyManager();

  // Create storage backends
  const vaultStorage = config.vaultStorage ?? new MemoryVaultStorage();
  const auditStorage = config.auditStorage ?? new MemoryAuditStorage();

  // Create vault manager
  const vaultManager = new VaultManager({
    storage: vaultStorage,
    keyManager,
  });

  // Create audit logger
  const auditLogger = new AuditLogger(auditStorage);

  // Create gate
  const gate = new Gate({
    vaultManager,
    auditLogger,
    accessRequestHandler: config.accessRequestHandler,
    accessNotificationHandler: config.accessNotificationHandler,
  });

  return new HmanSDK(keyManager, vaultManager, auditLogger, gate);
}
