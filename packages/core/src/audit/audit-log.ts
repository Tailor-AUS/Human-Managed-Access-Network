/**
 * HMAN Audit Log
 *
 * All access is logged locally with integrity verification
 */

import { v4 as uuidv4 } from 'uuid';
import {
  type AuditLogEntry,
  type AuditAction,
  type AuditActor,
  type AuditResource,
  type AuditOutcome,
  type AuditQuery,
  type AuditSummary,
} from '@hman/shared';
import { hashString } from '../crypto/index.js';

export interface AuditStorage {
  saveEntry(entry: AuditLogEntry): Promise<void>;
  getEntry(entryId: string): Promise<AuditLogEntry | null>;
  getLatestEntry(): Promise<AuditLogEntry | null>;
  queryEntries(query: AuditQuery): Promise<AuditLogEntry[]>;
  countEntries(query: AuditQuery): Promise<number>;
}

/**
 * Audit Logger - maintains an integrity-verified audit trail
 */
export class AuditLogger {
  private storage: AuditStorage;
  private lastEntryHash: string | undefined;

  constructor(storage: AuditStorage) {
    this.storage = storage;
  }

  /**
   * Initialize by loading the last entry hash
   */
  async init(): Promise<void> {
    const lastEntry = await this.storage.getLatestEntry();
    if (lastEntry) {
      this.lastEntryHash = lastEntry.entryHash;
    }
  }

  /**
   * Log an action
   */
  async log(
    action: AuditAction,
    actor: AuditActor,
    resource: AuditResource,
    outcome: AuditOutcome,
    metadata?: Record<string, unknown>
  ): Promise<AuditLogEntry> {
    const entry: AuditLogEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      action,
      actor,
      resource,
      outcome,
      metadata,
      previousEntryHash: this.lastEntryHash,
      entryHash: '', // Will be computed
    };

    // Compute hash of this entry (including previous hash for chain integrity)
    entry.entryHash = this.computeEntryHash(entry);
    this.lastEntryHash = entry.entryHash;

    await this.storage.saveEntry(entry);
    return entry;
  }

  /**
   * Compute hash of an entry for integrity verification
   */
  private computeEntryHash(entry: AuditLogEntry): string {
    const hashInput = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp.toISOString(),
      action: entry.action,
      actor: entry.actor,
      resource: entry.resource,
      outcome: entry.outcome,
      metadata: entry.metadata,
      previousEntryHash: entry.previousEntryHash,
    });
    return hashString(hashInput);
  }

  /**
   * Verify integrity of the audit log
   */
  async verifyIntegrity(entries: AuditLogEntry[]): Promise<{
    valid: boolean;
    brokenAt?: string;
    errors: string[];
  }> {
    const errors: string[] = [];
    let expectedPreviousHash: string | undefined;

    for (const entry of entries) {
      // Verify chain link
      if (entry.previousEntryHash !== expectedPreviousHash) {
        errors.push(`Chain broken at entry ${entry.id}: expected previous hash ${expectedPreviousHash}, got ${entry.previousEntryHash}`);
        return { valid: false, brokenAt: entry.id, errors };
      }

      // Verify entry hash
      const computedHash = this.computeEntryHash(entry);
      if (computedHash !== entry.entryHash) {
        errors.push(`Hash mismatch at entry ${entry.id}: expected ${computedHash}, got ${entry.entryHash}`);
        return { valid: false, brokenAt: entry.id, errors };
      }

      expectedPreviousHash = entry.entryHash;
    }

    return { valid: true, errors: [] };
  }

  /**
   * Query audit entries
   */
  async query(query: AuditQuery): Promise<AuditLogEntry[]> {
    return this.storage.queryEntries(query);
  }

  /**
   * Get a summary of audit activity
   */
  async getSummary(startTime: Date, endTime: Date): Promise<AuditSummary> {
    const query: AuditQuery = { startTime, endTime };
    const entries = await this.storage.queryEntries(query);

    const actionCounts: Record<string, number> = {};
    const actorTypeCounts: Record<string, number> = {};
    const resourceCounts: Map<string, number> = new Map();
    const actorCounts: Map<string, { name: string; count: number }> = new Map();
    let successCount = 0;
    let failureCount = 0;

    for (const entry of entries) {
      // Count by action
      actionCounts[entry.action] = (actionCounts[entry.action] || 0) + 1;

      // Count by actor type
      actorTypeCounts[entry.actor.type] = (actorTypeCounts[entry.actor.type] || 0) + 1;

      // Count by resource
      resourceCounts.set(
        entry.resource.uri,
        (resourceCounts.get(entry.resource.uri) || 0) + 1
      );

      // Count by actor
      const existing = actorCounts.get(entry.actor.id);
      if (existing) {
        existing.count++;
      } else {
        actorCounts.set(entry.actor.id, { name: entry.actor.name, count: 1 });
      }

      // Count success/failure
      if (entry.outcome.success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    // Get top resources
    const topResources = Array.from(resourceCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([uri, accessCount]) => ({ uri, accessCount }));

    // Get top actors
    const topActors = Array.from(actorCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([id, { name, count }]) => ({ id, name, actionCount: count }));

    return {
      startTime,
      endTime,
      totalActions: entries.length,
      actionCounts: actionCounts as Record<AuditAction, number>,
      actorTypeCounts: actorTypeCounts as Record<AuditActor['type'], number>,
      successCount,
      failureCount,
      topResources,
      topActors,
    };
  }

  // Convenience methods for common log types

  async logAccessRequest(
    requester: AuditActor,
    resource: AuditResource
  ): Promise<AuditLogEntry> {
    return this.log(
      'access_request',
      requester,
      resource,
      { success: true }
    );
  }

  async logAccessGranted(
    requester: AuditActor,
    resource: AuditResource,
    approvalMethod: 'auto' | 'user_approved' | 'delegate_approved' | 'pre_authorized',
    accessDuration?: string
  ): Promise<AuditLogEntry> {
    return this.log(
      'access_granted',
      requester,
      resource,
      { success: true, approvalMethod, accessDuration }
    );
  }

  async logAccessDenied(
    requester: AuditActor,
    resource: AuditResource,
    reason: string
  ): Promise<AuditLogEntry> {
    return this.log(
      'access_denied',
      requester,
      resource,
      { success: false, failureReason: reason }
    );
  }

  async logDataRead(
    actor: AuditActor,
    resource: AuditResource
  ): Promise<AuditLogEntry> {
    return this.log(
      'data_read',
      actor,
      resource,
      { success: true }
    );
  }

  async logPaymentApproved(
    actor: AuditActor,
    resource: AuditResource,
    paymentDetails: Record<string, unknown>
  ): Promise<AuditLogEntry> {
    return this.log(
      'payment_approved',
      actor,
      resource,
      { success: true },
      paymentDetails
    );
  }

  async logDelegationCreated(
    actor: AuditActor,
    resource: AuditResource,
    delegationDetails: Record<string, unknown>
  ): Promise<AuditLogEntry> {
    return this.log(
      'delegation_created',
      actor,
      resource,
      { success: true },
      delegationDetails
    );
  }
}

/**
 * In-memory audit storage for testing/demos
 */
export class MemoryAuditStorage implements AuditStorage {
  private entries: AuditLogEntry[] = [];

  async saveEntry(entry: AuditLogEntry): Promise<void> {
    this.entries.push({ ...entry });
  }

  async getEntry(entryId: string): Promise<AuditLogEntry | null> {
    return this.entries.find(e => e.id === entryId) ?? null;
  }

  async getLatestEntry(): Promise<AuditLogEntry | null> {
    if (this.entries.length === 0) return null;
    return this.entries[this.entries.length - 1];
  }

  async queryEntries(query: AuditQuery): Promise<AuditLogEntry[]> {
    let results = [...this.entries];

    if (query.startTime) {
      results = results.filter(e => e.timestamp >= query.startTime!);
    }
    if (query.endTime) {
      results = results.filter(e => e.timestamp <= query.endTime!);
    }
    if (query.actions && query.actions.length > 0) {
      results = results.filter(e => query.actions!.includes(e.action));
    }
    if (query.actorId) {
      results = results.filter(e => e.actor.id === query.actorId);
    }
    if (query.actorType) {
      results = results.filter(e => e.actor.type === query.actorType);
    }
    if (query.vaultId) {
      results = results.filter(e => e.resource.vaultId === query.vaultId);
    }
    if (query.resourceUri) {
      results = results.filter(e => e.resource.uri === query.resourceUri);
    }
    if (query.successOnly) {
      results = results.filter(e => e.outcome.success);
    }
    if (query.failureOnly) {
      results = results.filter(e => !e.outcome.success);
    }

    // Sort by timestamp
    results.sort((a, b) => {
      const order = query.sortOrder === 'asc' ? 1 : -1;
      return order * (a.timestamp.getTime() - b.timestamp.getTime());
    });

    // Pagination
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    results = results.slice(offset, offset + limit);

    return results;
  }

  async countEntries(query: AuditQuery): Promise<number> {
    const results = await this.queryEntries({ ...query, limit: undefined, offset: undefined });
    return results.length;
  }

  clear(): void {
    this.entries = [];
  }
}
