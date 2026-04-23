/**
 * Entity module — multi-entity model for .HMAN.
 *
 * Each member can run multiple entities (Personal, Trade, Household, ...).
 * See PROTOCOL.md § Multi-Entity Model.
 */

export {
  EntityManager,
  EntityError,
  EntityErrorCode,
  canonicalJsonBytes,
  type EntityStorage,
  type EntityManagerConfig,
  type CreateEntityInput,
  type UpdateEntityInput,
} from './entity-manager.js';

export { MemoryEntityStorage } from './memory-storage.js';

export {
  generateEntityKeyPair,
  signDetachedEd25519,
  verifyDetachedEd25519,
  type Ed25519KeyPair,
} from './entity-keys.js';

export { migrateToMultiEntity } from './migrate.js';
