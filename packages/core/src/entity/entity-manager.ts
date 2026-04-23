/**
 * EntityManager — CRUD, lifecycle and signing for member entities.
 *
 * Each entity is a scoped persona under a single member root identity.
 * See PROTOCOL.md § Multi-Entity Model for the full spec.
 */

import { v4 as uuidv4 } from 'uuid';
import sodium from 'libsodium-wrappers-sumo';
import {
  EntityStatus,
  DEFAULT_RECEPTIVITY_POLICY,
  type Entity,
  type EntityId,
  type EntityKeyData,
  type MemberId,
  type PaymentRailNomination,
  type ReceptivityPolicy,
  type VaultScope,
} from '@hman/shared';
import { KeyManager } from '../crypto/keys.js';
import { verifyDetachedEd25519 } from './entity-keys.js';

export class EntityError extends Error {
  constructor(
    message: string,
    public readonly code: EntityErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'EntityError';
  }
}

export enum EntityErrorCode {
  NotFound = 'ENTITY_NOT_FOUND',
  AlreadyExists = 'ENTITY_ALREADY_EXISTS',
  KeyNotLoaded = 'ENTITY_KEY_NOT_LOADED',
  KeyManagerLocked = 'KEY_MANAGER_LOCKED',
  StorageError = 'STORAGE_ERROR',
  InvalidInput = 'INVALID_INPUT',
}

export interface EntityStorage {
  saveEntity(entity: Entity): Promise<void>;
  getEntity(id: EntityId): Promise<Entity | null>;
  getAllEntities(): Promise<Entity[]>;
  deleteEntity(id: EntityId): Promise<void>;

  saveEntityKey(keyData: EntityKeyData): Promise<void>;
  getEntityKey(entityId: EntityId): Promise<EntityKeyData | null>;
  getAllEntityKeys(): Promise<EntityKeyData[]>;
  deleteEntityKey(entityId: EntityId): Promise<void>;
}

export interface EntityManagerConfig {
  storage: EntityStorage;
  keyManager: KeyManager;
  /** Root member identity this manager operates under. */
  memberId: MemberId;
}

export interface CreateEntityInput {
  display_name: string;
  nominated_rails?: PaymentRailNomination[];
  vault_scope?: VaultScope;
  receptivity_policy?: ReceptivityPolicy;
}

export interface UpdateEntityInput {
  display_name?: string;
  nominated_rails?: PaymentRailNomination[];
  vault_scope?: VaultScope;
  receptivity_policy?: ReceptivityPolicy;
  status?: EntityStatus;
}

export class EntityManager {
  private storage: EntityStorage;
  private keyManager: KeyManager;
  private memberId: MemberId;

  constructor(config: EntityManagerConfig) {
    this.storage = config.storage;
    this.keyManager = config.keyManager;
    this.memberId = config.memberId;
  }

  get member_id(): MemberId {
    return this.memberId;
  }

  /**
   * Create a new entity: generate its Ed25519 signing key, persist
   * both the entity record and the encrypted key material, return the
   * created Entity.
   */
  async createEntity(input: CreateEntityInput): Promise<Entity> {
    this.requireUnlocked();
    this.validateString(input.display_name, 'display_name', 255);

    const id: EntityId = uuidv4();
    const keyData = this.keyManager.createEntityKey(id);

    const now = new Date().toISOString();
    const entity: Entity = {
      id,
      member_id: this.memberId,
      display_name: input.display_name,
      created_at: now,
      updated_at: now,
      key_pub: keyData.public_key,
      nominated_rails: input.nominated_rails ?? [],
      vault_scope: input.vault_scope ?? { vaultIds: [] },
      receptivity_policy: input.receptivity_policy ?? DEFAULT_RECEPTIVITY_POLICY,
      status: EntityStatus.Active,
    };

    await this.storage.saveEntityKey(keyData);
    await this.storage.saveEntity(entity);
    return entity;
  }

  async getEntity(id: EntityId): Promise<Entity | null> {
    return this.storage.getEntity(id);
  }

  async getAllEntities(): Promise<Entity[]> {
    return this.storage.getAllEntities();
  }

  async getEntityByName(display_name: string): Promise<Entity | null> {
    const all = await this.storage.getAllEntities();
    return all.find((e) => e.display_name === display_name) ?? null;
  }

  async updateEntity(id: EntityId, patch: UpdateEntityInput): Promise<Entity> {
    const existing = await this.mustGet(id);

    const next: Entity = {
      ...existing,
      ...(patch.display_name !== undefined && { display_name: patch.display_name }),
      ...(patch.nominated_rails !== undefined && { nominated_rails: patch.nominated_rails }),
      ...(patch.vault_scope !== undefined && { vault_scope: patch.vault_scope }),
      ...(patch.receptivity_policy !== undefined && { receptivity_policy: patch.receptivity_policy }),
      ...(patch.status !== undefined && { status: patch.status }),
      updated_at: new Date().toISOString(),
    };

    await this.storage.saveEntity(next);
    return next;
  }

  async suspend(id: EntityId): Promise<Entity> {
    return this.updateEntity(id, { status: EntityStatus.Suspended });
  }

  async activate(id: EntityId): Promise<Entity> {
    return this.updateEntity(id, { status: EntityStatus.Active });
  }

  async archive(id: EntityId): Promise<Entity> {
    return this.updateEntity(id, { status: EntityStatus.Archived });
  }

  /**
   * Hard-delete an entity and its key material. Prefer `archive()` for
   * anything that might need to be re-activated.
   */
  async deleteEntity(id: EntityId): Promise<void> {
    this.keyManager.unloadEntityKey(id);
    await this.storage.deleteEntityKey(id);
    await this.storage.deleteEntity(id);
  }

  // ---------------------------------------------------------------------------
  // Vault scope helpers
  // ---------------------------------------------------------------------------

  async attachVault(entityId: EntityId, vaultId: string): Promise<Entity> {
    const existing = await this.mustGet(entityId);
    if (existing.vault_scope.vaultIds.includes(vaultId)) {
      return existing;
    }
    const nextScope: VaultScope = {
      ...existing.vault_scope,
      vaultIds: [...existing.vault_scope.vaultIds, vaultId],
    };
    return this.updateEntity(entityId, { vault_scope: nextScope });
  }

  async detachVault(entityId: EntityId, vaultId: string): Promise<Entity> {
    const existing = await this.mustGet(entityId);
    if (!existing.vault_scope.vaultIds.includes(vaultId)) {
      return existing;
    }
    const nextScope: VaultScope = {
      ...existing.vault_scope,
      vaultIds: existing.vault_scope.vaultIds.filter((v) => v !== vaultId),
    };
    return this.updateEntity(entityId, { vault_scope: nextScope });
  }

  async listVaultIds(entityId: EntityId): Promise<string[]> {
    const entity = await this.mustGet(entityId);
    return [...entity.vault_scope.vaultIds];
  }

  // ---------------------------------------------------------------------------
  // Keys — load / sign / verify
  // ---------------------------------------------------------------------------

  /**
   * Load all persisted entity signing keys into the KeyManager cache.
   * Call this after unlock so sign-as-entity works without extra state.
   */
  async loadAllKeys(): Promise<void> {
    this.requireUnlocked();
    const records = await this.storage.getAllEntityKeys();
    for (const rec of records) {
      this.keyManager.loadEntityKey(rec);
    }
  }

  /**
   * Ensure a specific entity's signing key is loaded. Returns true if
   * the key was already loaded or has been successfully loaded now,
   * false if the key is not persisted.
   */
  async ensureKeyLoaded(entityId: EntityId): Promise<boolean> {
    if (this.keyManager.hasEntityKey(entityId)) {
      return true;
    }
    const rec = await this.storage.getEntityKey(entityId);
    if (!rec) return false;
    this.keyManager.loadEntityKey(rec);
    return true;
  }

  /**
   * Sign a message with the entity's Ed25519 key. Auto-loads the key
   * if persisted but not yet in memory.
   */
  async sign(entityId: EntityId, message: Uint8Array): Promise<string> {
    const loaded = await this.ensureKeyLoaded(entityId);
    if (!loaded) {
      throw new EntityError(
        `No signing key persisted for entity ${entityId}`,
        EntityErrorCode.KeyNotLoaded
      );
    }
    return this.keyManager.signAsEntity(entityId, message);
  }

  /**
   * Verify a signature against the entity's published public key.
   */
  async verify(
    entityId: EntityId,
    message: Uint8Array,
    signatureBase64: string
  ): Promise<boolean> {
    const entity = await this.storage.getEntity(entityId);
    if (!entity) return false;
    return verifyDetachedEd25519(message, signatureBase64, entity.key_pub);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async mustGet(id: EntityId): Promise<Entity> {
    const entity = await this.storage.getEntity(id);
    if (!entity) {
      throw new EntityError(`Entity not found: ${id}`, EntityErrorCode.NotFound);
    }
    return entity;
  }

  private requireUnlocked(): void {
    if (!this.keyManager.isUnlocked()) {
      throw new EntityError(
        'Key manager is locked',
        EntityErrorCode.KeyManagerLocked
      );
    }
  }

  private validateString(value: string, field: string, maxLength: number): void {
    if (!value || typeof value !== 'string') {
      throw new EntityError(
        `${field} is required`,
        EntityErrorCode.InvalidInput
      );
    }
    if (value.trim().length === 0) {
      throw new EntityError(
        `${field} cannot be empty`,
        EntityErrorCode.InvalidInput
      );
    }
    if (value.length > maxLength) {
      throw new EntityError(
        `${field} exceeds maximum length of ${maxLength}`,
        EntityErrorCode.InvalidInput
      );
    }
  }
}

/**
 * Helper to stringify a JSON payload into canonical bytes for signing.
 * Keys are sorted lexicographically so two peers compute the same bytes.
 */
export function canonicalJsonBytes(value: unknown): Uint8Array {
  const canonical = canonicalise(value);
  return sodium.from_string(JSON.stringify(canonical));
}

function canonicalise(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalise);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = canonicalise(obj[key]);
  }
  return sorted;
}
