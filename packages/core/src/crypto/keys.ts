/**
 * HMAN Key Management
 *
 * Implements the HMAN key hierarchy:
 *
 * User Passphrase + Device Key
 *         │
 *         ▼ (Argon2id)
 *    Master Key
 *         │
 *         ├──► Vault Key (Finance)     ──► Item Keys
 *         ├──► Vault Key (Health)      ──► Item Keys
 *         ├──► Vault Key (Identity)    ──► Item Keys
 *         ├──► Vault Key (Diary)       ──► Item Keys
 *         └──► Delegation Keys         ──► Scoped, time-bound
 */

import {
  initCrypto,
  deriveKeyFromPassphrase,
  generateKey,
  encryptKey,
  decryptKey,
  secureWipe,
  toBase64,
  fromBase64,
  hashString,
  type KeyDerivationConfig,
  DEFAULT_KEY_DERIVATION_CONFIG,
} from './encryption.js';

export interface MasterKeyData {
  /** Base64-encoded salt used for key derivation */
  salt: string;
  /** Key derivation configuration */
  config: KeyDerivationConfig;
  /** Hash of the master key for verification (not the key itself!) */
  keyHash: string;
}

export interface VaultKeyData {
  /** Vault identifier */
  vaultId: string;
  /** Encrypted vault key (encrypted with master key) */
  encryptedKey: string;
  /** Nonce for encryption */
  nonce: string;
  /** Creation timestamp */
  createdAt: string;
}

/**
 * Key Manager - handles the entire key hierarchy
 */
export class KeyManager {
  private masterKey: Uint8Array | null = null;
  private vaultKeys: Map<string, Uint8Array> = new Map();
  private initialized = false;

  /**
   * Initialize the key manager
   */
  async init(): Promise<void> {
    await initCrypto();
    this.initialized = true;
  }

  private ensureInit(): void {
    if (!this.initialized) {
      throw new Error('KeyManager not initialized. Call init() first.');
    }
  }

  /**
   * Create a new master key from a passphrase
   * Returns the data needed to persist (but NOT the key itself)
   */
  async createMasterKey(
    passphrase: string,
    config: KeyDerivationConfig = DEFAULT_KEY_DERIVATION_CONFIG
  ): Promise<MasterKeyData> {
    this.ensureInit();

    const { key, salt } = await deriveKeyFromPassphrase(passphrase, undefined, config);

    // Store in memory
    this.masterKey = key;

    // Return persistence data
    return {
      salt: toBase64(salt),
      config,
      keyHash: hashString(toBase64(key)),
    };
  }

  /**
   * Unlock with an existing passphrase
   */
  async unlock(passphrase: string, masterKeyData: MasterKeyData): Promise<boolean> {
    this.ensureInit();

    const salt = fromBase64(masterKeyData.salt);
    const { key } = await deriveKeyFromPassphrase(passphrase, salt, masterKeyData.config);

    // Verify the key
    const keyHash = hashString(toBase64(key));
    if (keyHash !== masterKeyData.keyHash) {
      secureWipe(key);
      return false;
    }

    this.masterKey = key;
    return true;
  }

  /**
   * Lock the key manager (wipe all keys from memory)
   */
  lock(): void {
    if (this.masterKey) {
      secureWipe(this.masterKey);
      this.masterKey = null;
    }

    for (const key of this.vaultKeys.values()) {
      secureWipe(key);
    }
    this.vaultKeys.clear();
  }

  /**
   * Check if the manager is unlocked
   */
  isUnlocked(): boolean {
    return this.masterKey !== null;
  }

  /**
   * Create a new vault key
   */
  createVaultKey(vaultId: string): VaultKeyData {
    this.ensureInit();
    if (!this.masterKey) {
      throw new Error('Master key not unlocked');
    }

    // Generate a new random vault key
    const vaultKey = generateKey();

    // Encrypt it with the master key
    const { encryptedKey, nonce } = encryptKey(vaultKey, this.masterKey);

    // Store in memory
    this.vaultKeys.set(vaultId, vaultKey);

    return {
      vaultId,
      encryptedKey,
      nonce,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Load a vault key from encrypted storage
   */
  loadVaultKey(vaultKeyData: VaultKeyData): void {
    this.ensureInit();
    if (!this.masterKey) {
      throw new Error('Master key not unlocked');
    }

    const vaultKey = decryptKey(
      vaultKeyData.encryptedKey,
      vaultKeyData.nonce,
      this.masterKey
    );

    this.vaultKeys.set(vaultKeyData.vaultId, vaultKey);
  }

  /**
   * Get a vault key (must be loaded first)
   */
  getVaultKey(vaultId: string): Uint8Array {
    const key = this.vaultKeys.get(vaultId);
    if (!key) {
      throw new Error(`Vault key not loaded: ${vaultId}`);
    }
    return key;
  }

  /**
   * Check if a vault key is loaded
   */
  hasVaultKey(vaultId: string): boolean {
    return this.vaultKeys.has(vaultId);
  }

  /**
   * Unload a specific vault key
   */
  unloadVaultKey(vaultId: string): void {
    const key = this.vaultKeys.get(vaultId);
    if (key) {
      secureWipe(key);
      this.vaultKeys.delete(vaultId);
    }
  }

  /**
   * Change the master passphrase
   * Re-encrypts all vault keys with the new master key
   */
  async changePassphrase(
    newPassphrase: string,
    config: KeyDerivationConfig = DEFAULT_KEY_DERIVATION_CONFIG
  ): Promise<{ masterKeyData: MasterKeyData; vaultKeys: VaultKeyData[] }> {
    this.ensureInit();
    if (!this.masterKey) {
      throw new Error('Master key not unlocked');
    }

    // Derive new master key
    const { key: newMasterKey, salt } = await deriveKeyFromPassphrase(
      newPassphrase,
      undefined,
      config
    );

    // Re-encrypt all vault keys with new master key
    const reEncryptedVaultKeys: VaultKeyData[] = [];
    for (const [vaultId, vaultKey] of this.vaultKeys) {
      const { encryptedKey, nonce } = encryptKey(vaultKey, newMasterKey);
      reEncryptedVaultKeys.push({
        vaultId,
        encryptedKey,
        nonce,
        createdAt: new Date().toISOString(),
      });
    }

    // Wipe old master key
    secureWipe(this.masterKey);

    // Store new master key
    this.masterKey = newMasterKey;

    return {
      masterKeyData: {
        salt: toBase64(salt),
        config,
        keyHash: hashString(toBase64(newMasterKey)),
      },
      vaultKeys: reEncryptedVaultKeys,
    };
  }

  /**
   * Generate a delegation key (scoped, time-bound)
   */
  createDelegationKey(
    vaultId: string,
    delegateId: string,
    expiresAt: Date
  ): { delegationKey: Uint8Array; metadata: DelegationKeyMetadata } {
    this.ensureInit();
    if (!this.masterKey) {
      throw new Error('Master key not unlocked');
    }

    // Generate a unique delegation key
    const delegationKey = generateKey();

    return {
      delegationKey,
      metadata: {
        vaultId,
        delegateId,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
    };
  }
}

export interface DelegationKeyMetadata {
  vaultId: string;
  delegateId: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * Create and initialize a new KeyManager
 */
export async function createKeyManager(): Promise<KeyManager> {
  const manager = new KeyManager();
  await manager.init();
  return manager;
}
