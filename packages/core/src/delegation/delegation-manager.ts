/**
 * HMAN Delegation Manager
 *
 * Manages delegated access to vaults - allowing users to grant
 * scoped, time-bound access to trusted contacts.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  type Delegation,
  type DelegationStatus,
  type DelegateInfo,
  type DelegatedPermission,
  type DelegationCondition,
  PermissionLevel,
} from '@hman/shared';
import { AuditLogger } from '../audit/index.js';
import {
  generateKeyPair,
  encryptForRecipient,
  decryptFromSender,
  toBase64,
  fromBase64,
} from '../crypto/encryption.js';

export interface DelegationStorage {
  saveDelegation(delegation: Delegation): Promise<void>;
  getDelegation(delegationId: string): Promise<Delegation | null>;
  getDelegationsByGrantor(grantorId: string): Promise<Delegation[]>;
  getDelegationsByDelegate(delegateId: string): Promise<Delegation[]>;
  getActiveDelegations(userId: string): Promise<Delegation[]>;
  deleteDelegation(delegationId: string): Promise<void>;
}

export interface DelegationManagerConfig {
  /** Current user's ID */
  userId: string;
  /** Storage backend */
  storage: DelegationStorage;
  /** Audit logger */
  auditLogger: AuditLogger;
  /** Handler for sending delegation invites */
  onSendInvite?: (delegation: Delegation, encryptedKey: string) => Promise<void>;
  /** Handler for receiving delegation invites */
  onReceiveInvite?: (delegation: Delegation) => Promise<boolean>;
}

export interface CreateDelegationParams {
  /** Delegate information */
  delegate: DelegateInfo;
  /** Vault IDs to delegate access to */
  vaultIds: string[];
  /** Specific permissions to grant */
  permissions: DelegatedPermission[];
  /** Optional conditions */
  conditions?: DelegationCondition[];
  /** Expiration date */
  expiresAt: Date;
}

/**
 * Delegation Manager - handles creating, accepting, and revoking delegations
 */
export class DelegationManager {
  private userId: string;
  private storage: DelegationStorage;
  private auditLogger: AuditLogger;
  private onSendInvite?: (delegation: Delegation, encryptedKey: string) => Promise<void>;
  private onReceiveInvite?: (delegation: Delegation) => Promise<boolean>;

  constructor(config: DelegationManagerConfig) {
    this.userId = config.userId;
    this.storage = config.storage;
    this.auditLogger = config.auditLogger;
    this.onSendInvite = config.onSendInvite;
    this.onReceiveInvite = config.onReceiveInvite;
  }

  /**
   * Create a new delegation
   */
  async createDelegation(params: CreateDelegationParams): Promise<Delegation> {
    const now = new Date();

    const delegation: Delegation = {
      id: uuidv4(),
      grantor: this.userId,
      delegate: params.delegate,
      vaultIds: params.vaultIds,
      permissions: params.permissions,
      conditions: params.conditions,
      createdAt: now,
      expiresAt: params.expiresAt,
      status: 'pending',
    };

    await this.storage.saveDelegation(delegation);

    // Log the delegation creation
    await this.auditLogger.log(
      'delegation_created',
      {
        type: 'user',
        id: this.userId,
        name: 'You',
      },
      {
        uri: `hman://delegations/${delegation.id}`,
        vaultId: params.vaultIds[0],
        permissionLevel: PermissionLevel.Gated,
      },
      { success: true },
      {
        delegateId: params.delegate.id,
        delegateHandle: params.delegate.handle,
        vaultIds: params.vaultIds,
        permissions: params.permissions.map(p => p.resourcePattern),
        expiresAt: params.expiresAt.toISOString(),
      }
    );

    // Send invite if handler is configured
    if (this.onSendInvite) {
      // Generate a delegation-specific key encrypted for the delegate
      const { publicKey } = generateKeyPair();
      const encryptedKey = toBase64(
        encryptForRecipient(publicKey, fromBase64(params.delegate.publicKey))
      );
      await this.onSendInvite(delegation, encryptedKey);
    }

    return delegation;
  }

  /**
   * Accept a delegation invite
   */
  async acceptDelegation(delegationId: string): Promise<Delegation> {
    const delegation = await this.storage.getDelegation(delegationId);
    if (!delegation) {
      throw new Error('Delegation not found');
    }

    if (delegation.delegate.id !== this.userId) {
      throw new Error('Not authorized to accept this delegation');
    }

    if (delegation.status !== 'pending') {
      throw new Error(`Cannot accept delegation with status: ${delegation.status}`);
    }

    if (delegation.expiresAt < new Date()) {
      delegation.status = 'expired';
      await this.storage.saveDelegation(delegation);
      throw new Error('Delegation has expired');
    }

    delegation.status = 'active';
    delegation.acceptedAt = new Date();
    await this.storage.saveDelegation(delegation);

    // Log acceptance
    await this.auditLogger.log(
      'delegation_accepted',
      {
        type: 'delegate',
        id: this.userId,
        name: delegation.delegate.displayName,
      },
      {
        uri: `hman://delegations/${delegation.id}`,
        vaultId: delegation.vaultIds[0],
        permissionLevel: PermissionLevel.Gated,
      },
      { success: true },
      {
        grantorId: delegation.grantor,
      }
    );

    return delegation;
  }

  /**
   * Revoke a delegation
   */
  async revokeDelegation(delegationId: string, reason?: string): Promise<Delegation> {
    const delegation = await this.storage.getDelegation(delegationId);
    if (!delegation) {
      throw new Error('Delegation not found');
    }

    if (delegation.grantor !== this.userId && delegation.delegate.id !== this.userId) {
      throw new Error('Not authorized to revoke this delegation');
    }

    delegation.status = 'revoked';
    delegation.revokedAt = new Date();
    delegation.revocationReason = reason;
    await this.storage.saveDelegation(delegation);

    // Log revocation
    await this.auditLogger.log(
      'delegation_revoked',
      {
        type: 'user',
        id: this.userId,
        name: 'You',
      },
      {
        uri: `hman://delegations/${delegation.id}`,
        vaultId: delegation.vaultIds[0],
        permissionLevel: PermissionLevel.Gated,
      },
      { success: true },
      {
        reason,
        revokedBy: this.userId === delegation.grantor ? 'grantor' : 'delegate',
      }
    );

    return delegation;
  }

  /**
   * Check if a delegate has permission for a specific action
   */
  async checkDelegatePermission(
    delegateId: string,
    vaultId: string,
    resourcePattern: string,
    action: string
  ): Promise<{ allowed: boolean; delegation?: Delegation; reason?: string }> {
    const delegations = await this.storage.getActiveDelegations(this.userId);

    for (const delegation of delegations) {
      // Check if delegation is for this delegate and vault
      if (delegation.delegate.id !== delegateId) continue;
      if (!delegation.vaultIds.includes(vaultId)) continue;

      // Check if delegation has expired
      if (delegation.expiresAt < new Date()) {
        delegation.status = 'expired';
        await this.storage.saveDelegation(delegation);
        continue;
      }

      // Check permissions
      for (const permission of delegation.permissions) {
        if (this.matchesPattern(resourcePattern, permission.resourcePattern)) {
          if (permission.actions.includes(action as any)) {
            // Check conditions
            const conditionResult = await this.checkConditions(delegation, { action });
            if (conditionResult.allowed) {
              return { allowed: true, delegation };
            } else {
              return { allowed: false, delegation, reason: conditionResult.reason };
            }
          }
        }
      }
    }

    return { allowed: false, reason: 'No matching delegation found' };
  }

  /**
   * Check if a resource pattern matches
   */
  private matchesPattern(resource: string, pattern: string): boolean {
    // Simple glob matching
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regexPattern}$`).test(resource);
  }

  /**
   * Check delegation conditions
   */
  private async checkConditions(
    delegation: Delegation,
    context: { action?: string; amount?: number }
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (!delegation.conditions || delegation.conditions.length === 0) {
      return { allowed: true };
    }

    for (const condition of delegation.conditions) {
      switch (condition.type) {
        case 'amount_limit': {
          if (context.amount !== undefined) {
            const maxAmount = condition.params.maxAmount as number;
            if (context.amount > maxAmount) {
              return {
                allowed: false,
                reason: `Amount ${context.amount} exceeds limit ${maxAmount}`,
              };
            }
          }
          break;
        }

        case 'time_window': {
          const now = new Date();
          const startHour = condition.params.startHour as number;
          const endHour = condition.params.endHour as number;
          const currentHour = now.getHours();

          if (currentHour < startHour || currentHour >= endHour) {
            return {
              allowed: false,
              reason: `Outside allowed time window (${startHour}:00 - ${endHour}:00)`,
            };
          }
          break;
        }

        case 'require_notification': {
          // This would trigger a notification to the grantor
          // For now, we just allow it
          break;
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Get delegations granted by this user
   */
  async getGrantedDelegations(): Promise<Delegation[]> {
    return this.storage.getDelegationsByGrantor(this.userId);
  }

  /**
   * Get delegations received by this user
   */
  async getReceivedDelegations(): Promise<Delegation[]> {
    return this.storage.getDelegationsByDelegate(this.userId);
  }

  /**
   * Get all active delegations (granted or received)
   */
  async getActiveDelegations(): Promise<Delegation[]> {
    return this.storage.getActiveDelegations(this.userId);
  }

  /**
   * Clean up expired delegations
   */
  async cleanupExpired(): Promise<number> {
    const delegations = await this.storage.getActiveDelegations(this.userId);
    let count = 0;

    for (const delegation of delegations) {
      if (delegation.expiresAt < new Date() && delegation.status === 'active') {
        delegation.status = 'expired';
        await this.storage.saveDelegation(delegation);

        await this.auditLogger.log(
          'delegation_expired',
          { type: 'system', id: 'system', name: 'System' },
          {
            uri: `hman://delegations/${delegation.id}`,
            vaultId: delegation.vaultIds[0],
            permissionLevel: PermissionLevel.Gated,
          },
          { success: true }
        );

        count++;
      }
    }

    return count;
  }
}

/**
 * In-memory delegation storage for testing
 */
export class MemoryDelegationStorage implements DelegationStorage {
  private delegations: Map<string, Delegation> = new Map();

  async saveDelegation(delegation: Delegation): Promise<void> {
    this.delegations.set(delegation.id, { ...delegation });
  }

  async getDelegation(delegationId: string): Promise<Delegation | null> {
    return this.delegations.get(delegationId) ?? null;
  }

  async getDelegationsByGrantor(grantorId: string): Promise<Delegation[]> {
    return Array.from(this.delegations.values())
      .filter(d => d.grantor === grantorId);
  }

  async getDelegationsByDelegate(delegateId: string): Promise<Delegation[]> {
    return Array.from(this.delegations.values())
      .filter(d => d.delegate.id === delegateId);
  }

  async getActiveDelegations(userId: string): Promise<Delegation[]> {
    return Array.from(this.delegations.values())
      .filter(d =>
        (d.grantor === userId || d.delegate.id === userId) &&
        d.status === 'active'
      );
  }

  async deleteDelegation(delegationId: string): Promise<void> {
    this.delegations.delete(delegationId);
  }

  clear(): void {
    this.delegations.clear();
  }
}
