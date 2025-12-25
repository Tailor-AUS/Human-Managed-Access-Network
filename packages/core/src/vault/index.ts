export {
  VaultManager,
  type VaultManagerConfig,
  type VaultStorage,
  type ItemQuery,
} from './vault-manager.js';

export { MemoryVaultStorage } from './memory-storage.js';

export { SQLiteVaultStorage, type SQLiteStorageConfig } from './sqlite-storage.js';
