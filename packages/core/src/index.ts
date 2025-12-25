/**
 * @hman/core - Core SDK for Human Managed Access Network
 *
 * This package provides:
 * - Encryption and key management (libsodium-based)
 * - Vault management with tiered permissions
 * - Audit logging with integrity verification
 * - Access control gate for HITL enforcement
 */

// Re-export everything from @hman/shared for convenience
export * from '@hman/shared';

// Crypto module
export {
  initCrypto,
  deriveKeyFromPassphrase,
  generateKey,
  generateNonce,
  encrypt,
  decrypt,
  encryptString,
  decryptString,
  encryptJSON,
  decryptJSON,
  encryptKey,
  decryptKey,
  generateKeyPair,
  encryptForRecipient,
  decryptFromSender,
  hash,
  hashString,
  secureWipe,
  toBase64,
  fromBase64,
  toHex,
  fromHex,
  randomBytes,
  secureCompare,
  DEFAULT_KEY_DERIVATION_CONFIG,
  KeyManager,
  createKeyManager,
  type KeyDerivationConfig,
  type MasterKeyData,
  type VaultKeyData,
  type DelegationKeyMetadata,
} from './crypto/index.js';

// Vault module
export {
  VaultManager,
  MemoryVaultStorage,
  SQLiteVaultStorage,
  type VaultManagerConfig,
  type VaultStorage,
  type ItemQuery,
  type SQLiteStorageConfig,
} from './vault/index.js';

// Audit module
export {
  AuditLogger,
  MemoryAuditStorage,
  SQLiteAuditStorage,
  type AuditStorage,
  type SQLiteAuditStorageConfig,
} from './audit/index.js';

// Access control module
export {
  Gate,
  type GateConfig,
  type GateDecision,
  type AccessRequestHandler,
  type AccessNotificationHandler,
} from './access/index.js';

// HMAN SDK - convenient wrapper for common operations
export { HmanSDK, createHmanSDK, type HmanSDKConfig } from './sdk.js';

// E2EE Messaging module
export {
  generateIdentityKeyPair,
  generatePreKey,
  generatePreKeys,
  encryptMessage,
  decryptMessage,
  SessionManager,
  createSessionManager,
  restoreSessionManager,
  MessageStore,
  type IdentityKeyPair,
  type PreKey,
  type SignedPreKey,
  type EncryptedMessage,
  type Session,
  type MessageStoreConfig,
  type StoredMessage,
} from './messaging/index.js';

// Demo data seeder
export {
  seedDemoData,
  seedIdentity,
  seedFinance,
  seedHealth,
  seedDiary,
  seedCalendar,
  type SeederOptions,
} from './seeder/index.js';
