/**
 * In-memory EntityStorage for tests and ephemeral scenarios.
 * Mirrors the MemoryVaultStorage pattern.
 */

import type { Entity, EntityId, EntityKeyData } from '@hman/shared';
import type { EntityStorage } from './entity-manager.js';

export class MemoryEntityStorage implements EntityStorage {
  private entities = new Map<EntityId, Entity>();
  private keys = new Map<EntityId, EntityKeyData>();

  async saveEntity(entity: Entity): Promise<void> {
    this.entities.set(entity.id, entity);
  }

  async getEntity(id: EntityId): Promise<Entity | null> {
    return this.entities.get(id) ?? null;
  }

  async getAllEntities(): Promise<Entity[]> {
    return Array.from(this.entities.values());
  }

  async deleteEntity(id: EntityId): Promise<void> {
    this.entities.delete(id);
  }

  async saveEntityKey(keyData: EntityKeyData): Promise<void> {
    this.keys.set(keyData.entity_id, keyData);
  }

  async getEntityKey(entityId: EntityId): Promise<EntityKeyData | null> {
    return this.keys.get(entityId) ?? null;
  }

  async getAllEntityKeys(): Promise<EntityKeyData[]> {
    return Array.from(this.keys.values());
  }

  async deleteEntityKey(entityId: EntityId): Promise<void> {
    this.keys.delete(entityId);
  }
}
