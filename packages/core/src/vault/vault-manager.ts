/**
 * HMAN Vault Manager
 *
 * Manages encrypted data vaults with tiered permission levels
 */

import { v4 as uuidv4 } from 'uuid';
import {
  type Vault,
  type VaultItem,
  type DecryptedVaultItem,
  type VaultEncryptionMetadata,
  VaultType,
  PermissionLevel,
  buildHmanUri,
} from '@hman/shared';
import {
  KeyManager,
  type VaultKeyData,
  encryptJSON,
  decryptJSON,
  DEFAULT_KEY_DERIVATION_CONFIG,
  toBase64,
  generateNonce,
} from '../crypto/index.js';

/** Error class for vault-related errors */
export class VaultError extends Error {
  constructor(
    message: string,
    public readonly code: VaultErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'VaultError';
  }
}

export enum VaultErrorCode {
  NotFound = 'VAULT_NOT_FOUND',
  Locked = 'VAULT_LOCKED',
  DecryptionFailed = 'DECRYPTION_FAILED',
  EncryptionFailed = 'ENCRYPTION_FAILED',
  StorageError = 'STORAGE_ERROR',
  KeyManagerLocked = 'KEY_MANAGER_LOCKED',
  InvalidInput = 'INVALID_INPUT',
}

export interface VaultManagerConfig {
  /** Storage backend for vaults */
  storage: VaultStorage;
  /** Key manager instance */
  keyManager: KeyManager;
}

/**
 * Storage interface - can be implemented by SQLite, IndexedDB, etc.
 */
export interface VaultStorage {
  // Vault operations
  saveVault(vault: Vault): Promise<void>;
  getVault(vaultId: string): Promise<Vault | null>;
  getAllVaults(): Promise<Vault[]>;
  deleteVault(vaultId: string): Promise<void>;

  // Vault key operations
  saveVaultKey(vaultKey: VaultKeyData): Promise<void>;
  getVaultKey(vaultId: string): Promise<VaultKeyData | null>;
  getAllVaultKeys(): Promise<VaultKeyData[]>;

  // Item operations
  saveItem(item: VaultItem): Promise<void>;
  getItem(itemId: string): Promise<VaultItem | null>;
  getItemsByVault(vaultId: string): Promise<VaultItem[]>;
  getItemsByType(vaultId: string, itemType: string): Promise<VaultItem[]>;
  queryItems(query: ItemQuery): Promise<VaultItem[]>;
  deleteItem(itemId: string): Promise<void>;
}

export interface ItemQuery {
  vaultId?: string;
  itemType?: string;
  tags?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Vault Manager - manages encrypted vaults and items
 */
export class VaultManager {
  private storage: VaultStorage;
  private keyManager: KeyManager;

  constructor(config: VaultManagerConfig) {
    this.storage = config.storage;
    this.keyManager = config.keyManager;
  }

  /**
   * Validate string input
   */
  private validateString(value: string, fieldName: string, maxLength = 1000): void {
    if (!value || typeof value !== 'string') {
      throw new VaultError(
        `${fieldName} is required and must be a string`,
        VaultErrorCode.InvalidInput
      );
    }
    if (value.trim().length === 0) {
      throw new VaultError(
        `${fieldName} cannot be empty`,
        VaultErrorCode.InvalidInput
      );
    }
    if (value.length > maxLength) {
      throw new VaultError(
        `${fieldName} exceeds maximum length of ${maxLength}`,
        VaultErrorCode.InvalidInput
      );
    }
  }

  /**
   * Safely decrypt JSON content with error handling
   */
  private safeDecryptJSON<T>(
    encryptedContent: string,
    nonce: string,
    vaultKey: Uint8Array,
    itemId: string
  ): T {
    if (!encryptedContent || !nonce) {
      throw new VaultError(
        `Missing encrypted content or nonce for item ${itemId}`,
        VaultErrorCode.DecryptionFailed
      );
    }

    try {
      return decryptJSON<T>(encryptedContent, nonce, vaultKey);
    } catch (err) {
      throw new VaultError(
        `Failed to decrypt item ${itemId}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        VaultErrorCode.DecryptionFailed,
        err instanceof Error ? err : undefined
      );
    }
  }

  /**
   * Create a new vault
   */
  async createVault(
    type: VaultType,
    name: string,
    options: {
      description?: string;
      defaultPermissionLevel?: PermissionLevel;
    } = {}
  ): Promise<Vault> {
    this.validateString(name, 'Vault name', 255);
    if (options.description) {
      this.validateString(options.description, 'Description', 1000);
    }

    if (!this.keyManager.isUnlocked()) {
      throw new VaultError('Key manager is locked', VaultErrorCode.KeyManagerLocked);
    }

    const vaultId = uuidv4();
    const now = new Date();

    // Create vault key
    const vaultKeyData = this.keyManager.createVaultKey(vaultId);
    await this.storage.saveVaultKey(vaultKeyData);

    // Create vault metadata
    const vault: Vault = {
      id: vaultId,
      type,
      name,
      description: options.description,
      defaultPermissionLevel: options.defaultPermissionLevel ?? this.getDefaultPermissionLevel(type),
      createdAt: now,
      updatedAt: now,
      isUnlocked: true,
      encryptionMetadata: {
        algorithm: 'argon2id',
        salt: toBase64(generateNonce()), // Just for metadata, actual key derivation uses KeyManager
        memoryCost: DEFAULT_KEY_DERIVATION_CONFIG.memoryCost,
        timeCost: DEFAULT_KEY_DERIVATION_CONFIG.timeCost,
        parallelism: DEFAULT_KEY_DERIVATION_CONFIG.parallelism,
        encryptedVaultKey: vaultKeyData.encryptedKey,
        vaultKeyNonce: vaultKeyData.nonce,
      },
    };

    await this.storage.saveVault(vault);
    return vault;
  }

  /**
   * Get default permission level for vault type
   */
  private getDefaultPermissionLevel(type: VaultType): PermissionLevel {
    switch (type) {
      case VaultType.Identity:
        return PermissionLevel.Open;
      case VaultType.Calendar:
      case VaultType.Diary:
        return PermissionLevel.Standard;
      case VaultType.Finance:
      case VaultType.Health:
        return PermissionLevel.Gated;
      case VaultType.Secrets:
        return PermissionLevel.Locked;
      default:
        return PermissionLevel.Standard;
    }
  }

  /**
   * Get a vault by ID
   */
  async getVault(vaultId: string): Promise<Vault | null> {
    return this.storage.getVault(vaultId);
  }

  /**
   * Get all vaults
   */
  async getAllVaults(): Promise<Vault[]> {
    return this.storage.getAllVaults();
  }

  /**
   * Unlock a vault (load its key into memory)
   */
  async unlockVault(vaultId: string): Promise<boolean> {
    if (!this.keyManager.isUnlocked()) {
      throw new Error('Key manager is locked');
    }

    if (this.keyManager.hasVaultKey(vaultId)) {
      return true; // Already unlocked
    }

    const vaultKeyData = await this.storage.getVaultKey(vaultId);
    if (!vaultKeyData) {
      return false;
    }

    this.keyManager.loadVaultKey(vaultKeyData);

    // Update vault status
    const vault = await this.storage.getVault(vaultId);
    if (vault) {
      vault.isUnlocked = true;
      await this.storage.saveVault(vault);
    }

    return true;
  }

  /**
   * Lock a vault (remove key from memory)
   */
  async lockVault(vaultId: string): Promise<void> {
    this.keyManager.unloadVaultKey(vaultId);

    const vault = await this.storage.getVault(vaultId);
    if (vault) {
      vault.isUnlocked = false;
      await this.storage.saveVault(vault);
    }
  }

  /**
   * Add an item to a vault
   */
  async addItem<T>(
    vaultId: string,
    itemType: string,
    title: string,
    content: T,
    options: {
      permissionLevel?: PermissionLevel;
      tags?: string[];
    } = {}
  ): Promise<VaultItem> {
    // Input validation
    this.validateString(vaultId, 'Vault ID', 36);
    this.validateString(itemType, 'Item type', 100);
    this.validateString(title, 'Title', 500);

    if (options.tags) {
      if (!Array.isArray(options.tags)) {
        throw new VaultError('Tags must be an array', VaultErrorCode.InvalidInput);
      }
      for (const tag of options.tags) {
        this.validateString(tag, 'Tag', 100);
      }
    }

    const vault = await this.storage.getVault(vaultId);
    if (!vault) {
      throw new VaultError(`Vault not found: ${vaultId}`, VaultErrorCode.NotFound);
    }

    if (!this.keyManager.hasVaultKey(vaultId)) {
      throw new VaultError(`Vault is locked: ${vaultId}`, VaultErrorCode.Locked);
    }

    const vaultKey = this.keyManager.getVaultKey(vaultId);
    const itemId = uuidv4();
    const now = new Date();

    // Encrypt the content
    const { ciphertext, nonce } = encryptJSON(content, vaultKey);

    // Build MCP resource URI
    const resourceUri = buildHmanUri({
      vault: vault.type,
      category: itemType,
      itemId,
    });

    const item: VaultItem = {
      id: itemId,
      vaultId,
      itemType,
      title,
      permission: options.permissionLevel !== undefined
        ? {
            level: options.permissionLevel,
            description: `Custom permission for ${title}`,
            delegatable: options.permissionLevel < PermissionLevel.Locked,
          }
        : undefined,
      createdAt: now,
      updatedAt: now,
      encryptedContent: ciphertext,
      contentNonce: nonce,
      tags: options.tags,
      resourceUri,
    };

    await this.storage.saveItem(item);

    // Update vault timestamp
    vault.updatedAt = now;
    await this.storage.saveVault(vault);

    return item;
  }

  /**
   * Get an item and decrypt it
   */
  async getItem<T>(itemId: string): Promise<DecryptedVaultItem<T> | null> {
    this.validateString(itemId, 'Item ID', 36);

    const item = await this.storage.getItem(itemId);
    if (!item) {
      return null;
    }

    if (!this.keyManager.hasVaultKey(item.vaultId)) {
      throw new VaultError(`Vault is locked: ${item.vaultId}`, VaultErrorCode.Locked);
    }

    const vaultKey = this.keyManager.getVaultKey(item.vaultId);
    const content = this.safeDecryptJSON<T>(
      item.encryptedContent,
      item.contentNonce,
      vaultKey,
      item.id
    );

    return {
      id: item.id,
      vaultId: item.vaultId,
      itemType: item.itemType,
      title: item.title,
      permission: item.permission,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      tags: item.tags,
      resourceUri: item.resourceUri,
      content,
    };
  }

  /**
   * Update an item's content
   */
  async updateItem<T>(itemId: string, content: T): Promise<VaultItem> {
    const item = await this.storage.getItem(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    if (!this.keyManager.hasVaultKey(item.vaultId)) {
      throw new Error(`Vault is locked: ${item.vaultId}`);
    }

    const vaultKey = this.keyManager.getVaultKey(item.vaultId);
    const { ciphertext, nonce } = encryptJSON(content, vaultKey);

    item.encryptedContent = ciphertext;
    item.contentNonce = nonce;
    item.updatedAt = new Date();

    await this.storage.saveItem(item);
    return item;
  }

  /**
   * Get all items in a vault (decrypted)
   */
  async getVaultItems<T>(vaultId: string): Promise<DecryptedVaultItem<T>[]> {
    this.validateString(vaultId, 'Vault ID', 36);

    if (!this.keyManager.hasVaultKey(vaultId)) {
      throw new VaultError(`Vault is locked: ${vaultId}`, VaultErrorCode.Locked);
    }

    const items = await this.storage.getItemsByVault(vaultId);
    const vaultKey = this.keyManager.getVaultKey(vaultId);
    const results: DecryptedVaultItem<T>[] = [];

    for (const item of items) {
      try {
        const content = this.safeDecryptJSON<T>(
          item.encryptedContent,
          item.contentNonce,
          vaultKey,
          item.id
        );
        results.push({
          id: item.id,
          vaultId: item.vaultId,
          itemType: item.itemType,
          title: item.title,
          permission: item.permission,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          tags: item.tags,
          resourceUri: item.resourceUri,
          content,
        });
      } catch (err) {
        // Log error but continue with other items
        console.error(`Failed to decrypt item ${item.id}:`, err);
      }
    }

    return results;
  }

  /**
   * Get items by type (decrypted)
   */
  async getItemsByType<T>(vaultId: string, itemType: string): Promise<DecryptedVaultItem<T>[]> {
    this.validateString(vaultId, 'Vault ID', 36);
    this.validateString(itemType, 'Item type', 100);

    if (!this.keyManager.hasVaultKey(vaultId)) {
      throw new VaultError(`Vault is locked: ${vaultId}`, VaultErrorCode.Locked);
    }

    const items = await this.storage.getItemsByType(vaultId, itemType);
    const vaultKey = this.keyManager.getVaultKey(vaultId);
    const results: DecryptedVaultItem<T>[] = [];

    for (const item of items) {
      try {
        const content = this.safeDecryptJSON<T>(
          item.encryptedContent,
          item.contentNonce,
          vaultKey,
          item.id
        );
        results.push({
          id: item.id,
          vaultId: item.vaultId,
          itemType: item.itemType,
          title: item.title,
          permission: item.permission,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          tags: item.tags,
          resourceUri: item.resourceUri,
          content,
        });
      } catch (err) {
        // Log error but continue with other items
        console.error(`Failed to decrypt item ${item.id}:`, err);
      }
    }

    return results;
  }

  /**
   * Delete an item
   */
  async deleteItem(itemId: string): Promise<void> {
    await this.storage.deleteItem(itemId);
  }

  /**
   * Delete a vault and all its items
   */
  async deleteVault(vaultId: string): Promise<void> {
    // First delete all items
    const items = await this.storage.getItemsByVault(vaultId);
    for (const item of items) {
      await this.storage.deleteItem(item.id);
    }

    // Unload the key
    this.keyManager.unloadVaultKey(vaultId);

    // Delete the vault
    await this.storage.deleteVault(vaultId);
  }

  /**
   * Get the effective permission level for an item
   */
  async getItemPermissionLevel(itemId: string): Promise<PermissionLevel> {
    const item = await this.storage.getItem(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    // Item-level permission takes precedence
    if (item.permission) {
      return item.permission.level;
    }

    // Fall back to vault default
    const vault = await this.storage.getVault(item.vaultId);
    if (!vault) {
      throw new Error(`Vault not found: ${item.vaultId}`);
    }

    return vault.defaultPermissionLevel;
  }

  /**
   * Set item-specific permission level
   */
  async setItemPermissionLevel(itemId: string, level: PermissionLevel): Promise<void> {
    const item = await this.storage.getItem(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    item.permission = {
      level,
      description: `Custom permission level ${level}`,
      delegatable: level < PermissionLevel.Locked,
    };
    item.updatedAt = new Date();

    await this.storage.saveItem(item);
  }
}
