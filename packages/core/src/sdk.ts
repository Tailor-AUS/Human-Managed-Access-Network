/**
 * HMAN SDK - Your Personal Data Representative
 * 
 * "Your data. Your rules. Any AI."
 * 
 * The SDK provides core functionality for:
 * - Encrypted vault management (your data stays yours)
 * - Tiered permission levels (Open, Standard, Gated, Locked)
 * - Access control gate (human in the loop - always)
 * - Audit logging (know who accessed what, when)
 * 
 * This SDK is LLM-agnostic - it works with ANY AI through MCP.
 */

import {
  VaultType,
  PermissionLevel,
  HmanFileType,
  HmanEncryption,
  HmanCompression,
  type HmanVaultExportPayload,
  type HmanExportedItem,
  type HmanFileOptions,
} from '@hman/shared';
import {
  createHmanFile,
  parseHmanFile,
  validateHmanFile,
} from './file/hman-file.js';
import { createKeyManager, KeyManager, type MasterKeyData } from './crypto/index.js';
import { VaultManager, MemoryVaultStorage, type VaultStorage } from './vault/index.js';
import { AuditLogger, MemoryAuditStorage, type AuditStorage } from './audit/index.js';
import { Gate, type AccessRequestHandler, type AccessNotificationHandler } from './access/index.js';
import {
  EntityManager,
  MemoryEntityStorage,
  migrateToMultiEntity,
  type EntityStorage,
} from './entity/index.js';

export interface HmanSDKConfig {
  /** Custom vault storage (defaults to in-memory) */
  vaultStorage?: VaultStorage;
  /** Custom audit storage (defaults to in-memory) */
  auditStorage?: AuditStorage;
  /** Custom entity storage (defaults to in-memory) */
  entityStorage?: EntityStorage;
  /** Root member identifier. Auto-generated when omitted. */
  memberId?: string;
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
  readonly entityManager: EntityManager;

  private masterKeyData: MasterKeyData | null = null;

  constructor(
    keyManager: KeyManager,
    vaultManager: VaultManager,
    auditLogger: AuditLogger,
    gate: Gate,
    entityManager: EntityManager
  ) {
    this.keyManager = keyManager;
    this.vaultManager = vaultManager;
    this.auditLogger = auditLogger;
    this.gate = gate;
    this.entityManager = entityManager;
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

    // Create the default "Personal" entity and attach all default vaults.
    // Idempotent via migrateToMultiEntity — safe to call after init as well.
    await migrateToMultiEntity(this.entityManager, this.vaultManager);
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

  /**
   * Export a vault to a .hman file buffer
   */
  async exportVault(
    vaultType: VaultType,
    options?: {
      password?: string;
      compress?: boolean;
    }
  ): Promise<Buffer> {
    const vault = await this.getVaultByType(vaultType);
    if (!vault) {
      throw new Error(`Vault not found: ${vaultType}`);
    }

    // Unlock and get all items
    await this.vaultManager.unlockVault(vault.id);
    const items = await this.vaultManager.getVaultItems(vault.id);

    // Build payload
    const payload: HmanVaultExportPayload = {
      vault: {
        id: vault.id,
        type: vault.type,
        name: vault.name,
        description: vault.description,
        defaultPermissionLevel: vault.defaultPermissionLevel,
        createdAt: vault.createdAt.toISOString(),
        updatedAt: vault.updatedAt.toISOString(),
      },
      items: items.map(item => ({
        id: item.id,
        type: item.itemType,
        label: item.title,
        data: item.content as Record<string, unknown>,
        metadata: {
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        },
        tags: item.tags,
        permissionLevel: item.permission?.level,
      })),
    };

    // Build file options
    const fileOptions: HmanFileOptions = {
      type: HmanFileType.VaultExport,
      encryption: options?.password ? {
        algorithm: HmanEncryption.AES256GCM,
        password: options.password,
      } : undefined,
      compression: options?.compress ? {
        algorithm: HmanCompression.Gzip,
      } : undefined,
    };

    return createHmanFile(payload, fileOptions, 'hman-sdk');
  }

  /**
   * Import a vault from a .hman file buffer
   */
  async importVault(
    buffer: Buffer,
    options?: {
      password?: string;
      overwrite?: boolean;
    }
  ): Promise<{ vaultId: string; itemCount: number }> {
    // Validate the file first
    const validation = validateHmanFile(buffer);
    if (!validation.isValid) {
      throw new Error(`Invalid .hman file: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    // Parse the file
    const parsed = await parseHmanFile<HmanVaultExportPayload>(buffer, options?.password);
    if (!parsed.isValid || !parsed.payload) {
      throw new Error(`Failed to parse .hman file: ${parsed.validationErrors?.join(', ')}`);
    }

    const { vault: vaultData, items } = parsed.payload;

    // Check if vault already exists
    const existingVault = await this.vaultManager.getVault(vaultData.id);
    if (existingVault && !options?.overwrite) {
      throw new Error(`Vault already exists: ${vaultData.name}. Use overwrite option to replace.`);
    }

    // Create or update vault
    let vault;
    if (existingVault && options?.overwrite) {
      vault = existingVault;
    } else {
      vault = await this.vaultManager.createVault(
        vaultData.type,
        vaultData.name,
        {
          description: vaultData.description,
          defaultPermissionLevel: vaultData.defaultPermissionLevel,
        }
      );
    }

    // Unlock vault and import items
    await this.vaultManager.unlockVault(vault.id);

    for (const item of items) {
      await this.vaultManager.addItem(
        vault.id,
        item.type,
        item.label,
        item.data,
        {
          permissionLevel: item.permissionLevel,
          tags: item.tags,
        }
      );
    }

    return {
      vaultId: vault.id,
      itemCount: items.length,
    };
  }

  /**
   * Validate a .hman file without importing it
   */
  validateHmanFile(buffer: Buffer): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const result = validateHmanFile(buffer);
    return {
      isValid: result.isValid,
      errors: result.errors.map(e => e.message),
      warnings: result.warnings.map(w => w.message),
    };
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
  const entityStorage = config.entityStorage ?? new MemoryEntityStorage();

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

  // Create entity manager (root member id falls back to a deterministic
  // placeholder — callers that care about identity should pass memberId).
  const entityManager = new EntityManager({
    storage: entityStorage,
    keyManager,
    memberId: config.memberId ?? 'member-local',
  });

  return new HmanSDK(keyManager, vaultManager, auditLogger, gate, entityManager);
}
