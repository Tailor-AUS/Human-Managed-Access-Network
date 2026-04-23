/**
 * Migrate an existing single-member .HMAN setup to the multi-entity model.
 *
 * Idempotent:
 *   1. If no entities exist, create a default "Personal" entity.
 *   2. For every vault without an entityId, attach it to the Personal
 *      entity (updates vault.entityId + entity.vault_scope.vaultIds).
 *   3. Safe to run repeatedly — a no-op once migrated.
 */

import {
  DEFAULT_PERSONAL_ENTITY_NAME,
  type Entity,
} from '@hman/shared';
import type { EntityManager } from './entity-manager.js';
import type { VaultManager } from '../vault/vault-manager.js';

export interface MigrateOptions {
  /** Display name for the auto-created entity. Defaults to "Personal". */
  defaultEntityName?: string;
}

export interface MigrateResult {
  /** The entity that unattached vaults were assigned to. */
  personalEntity: Entity;
  /** How many vaults had their entityId set during this run. */
  vaultsAttached: number;
  /** Whether the Personal entity was created during this run. */
  entityCreated: boolean;
}

export async function migrateToMultiEntity(
  entityManager: EntityManager,
  vaultManager: VaultManager,
  options: MigrateOptions = {}
): Promise<MigrateResult> {
  const name = options.defaultEntityName ?? DEFAULT_PERSONAL_ENTITY_NAME;

  // Step 1: find or create the Personal entity.
  let personal = await entityManager.getEntityByName(name);
  let entityCreated = false;
  if (!personal) {
    personal = await entityManager.createEntity({
      display_name: name,
    });
    entityCreated = true;
  }

  // Step 2: attach all unattached vaults to the Personal entity.
  const allVaults = await vaultManager.getAllVaults();
  const unattached = allVaults.filter((v) => !v.entityId);
  const existingIds = new Set(personal.vault_scope.vaultIds);

  for (const vault of unattached) {
    await vaultManager.setVaultEntity(vault.id, personal.id);
    if (!existingIds.has(vault.id)) {
      personal = await entityManager.attachVault(personal.id, vault.id);
      existingIds.add(vault.id);
    }
  }

  return {
    personalEntity: personal,
    vaultsAttached: unattached.length,
    entityCreated,
  };
}
