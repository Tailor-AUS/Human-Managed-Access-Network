/**
 * SQLite Storage Backend for HMAN Audit Logs
 */

import Database from 'better-sqlite3';
import type { AuditLogEntry, AuditQuery } from '@hman/shared';
import type { AuditStorage } from './audit-log.js';

export interface SQLiteAuditStorageConfig {
  /** Path to the database file */
  dbPath: string;
  /** Enable WAL mode for better concurrency */
  walMode?: boolean;
  /** Maximum number of entries to keep (for rotation) */
  maxEntries?: number;
}

export class SQLiteAuditStorage implements AuditStorage {
  private db: Database.Database;
  private maxEntries?: number;

  constructor(config: SQLiteAuditStorageConfig) {
    this.db = new Database(config.dbPath);
    this.maxEntries = config.maxEntries;

    if (config.walMode !== false) {
      this.db.pragma('journal_mode = WAL');
    }

    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      -- Audit log table
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        actor_type TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        actor_model_id TEXT,
        actor_device_info TEXT,
        resource_uri TEXT NOT NULL,
        resource_vault_id TEXT NOT NULL,
        resource_item_id TEXT,
        resource_permission_level INTEGER NOT NULL,
        resource_description TEXT,
        outcome_success INTEGER NOT NULL,
        outcome_failure_reason TEXT,
        outcome_approval_method TEXT,
        outcome_access_duration TEXT,
        metadata TEXT,
        previous_entry_hash TEXT,
        entry_hash TEXT NOT NULL
      );

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
      CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);
      CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource_uri);
      CREATE INDEX IF NOT EXISTS idx_audit_vault ON audit_log(resource_vault_id);
    `);
  }

  async saveEntry(entry: AuditLogEntry): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO audit_log (
        id, timestamp, action,
        actor_type, actor_id, actor_name, actor_model_id, actor_device_info,
        resource_uri, resource_vault_id, resource_item_id, resource_permission_level, resource_description,
        outcome_success, outcome_failure_reason, outcome_approval_method, outcome_access_duration,
        metadata, previous_entry_hash, entry_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.id,
      entry.timestamp.toISOString(),
      entry.action,
      entry.actor.type,
      entry.actor.id,
      entry.actor.name,
      entry.actor.modelId ?? null,
      entry.actor.deviceInfo ?? null,
      entry.resource.uri,
      entry.resource.vaultId,
      entry.resource.itemId ?? null,
      entry.resource.permissionLevel,
      entry.resource.description ?? null,
      entry.outcome.success ? 1 : 0,
      entry.outcome.failureReason ?? null,
      entry.outcome.approvalMethod ?? null,
      entry.outcome.accessDuration ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.previousEntryHash ?? null,
      entry.entryHash
    );

    // Rotate old entries if maxEntries is set
    if (this.maxEntries) {
      await this.rotateEntries();
    }
  }

  async getEntry(entryId: string): Promise<AuditLogEntry | null> {
    const stmt = this.db.prepare('SELECT * FROM audit_log WHERE id = ?');
    const row = stmt.get(entryId) as AuditRow | undefined;

    if (!row) return null;
    return this.rowToEntry(row);
  }

  async getLatestEntry(): Promise<AuditLogEntry | null> {
    const stmt = this.db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 1');
    const row = stmt.get() as AuditRow | undefined;

    if (!row) return null;
    return this.rowToEntry(row);
  }

  async queryEntries(query: AuditQuery): Promise<AuditLogEntry[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.startTime) {
      conditions.push('timestamp >= ?');
      params.push(query.startTime.toISOString());
    }

    if (query.endTime) {
      conditions.push('timestamp <= ?');
      params.push(query.endTime.toISOString());
    }

    if (query.actions && query.actions.length > 0) {
      const placeholders = query.actions.map(() => '?').join(', ');
      conditions.push(`action IN (${placeholders})`);
      params.push(...query.actions);
    }

    if (query.actorId) {
      conditions.push('actor_id = ?');
      params.push(query.actorId);
    }

    if (query.actorType) {
      conditions.push('actor_type = ?');
      params.push(query.actorType);
    }

    if (query.vaultId) {
      conditions.push('resource_vault_id = ?');
      params.push(query.vaultId);
    }

    if (query.resourceUri) {
      conditions.push('resource_uri = ?');
      params.push(query.resourceUri);
    }

    if (query.successOnly) {
      conditions.push('outcome_success = 1');
    }

    if (query.failureOnly) {
      conditions.push('outcome_success = 0');
    }

    let sql = 'SELECT * FROM audit_log';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const sortOrder = query.sortOrder === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY timestamp ${sortOrder}`;

    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;
    sql += ` LIMIT ${limit} OFFSET ${offset}`;

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as AuditRow[];

    return rows.map(row => this.rowToEntry(row));
  }

  async countEntries(query: AuditQuery): Promise<number> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.startTime) {
      conditions.push('timestamp >= ?');
      params.push(query.startTime.toISOString());
    }

    if (query.endTime) {
      conditions.push('timestamp <= ?');
      params.push(query.endTime.toISOString());
    }

    if (query.actions && query.actions.length > 0) {
      const placeholders = query.actions.map(() => '?').join(', ');
      conditions.push(`action IN (${placeholders})`);
      params.push(...query.actions);
    }

    let sql = 'SELECT COUNT(*) as count FROM audit_log';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as { count: number };

    return result.count;
  }

  private async rotateEntries(): Promise<void> {
    if (!this.maxEntries) return;

    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM audit_log');
    const { count } = countStmt.get() as { count: number };

    if (count > this.maxEntries) {
      const toDelete = count - this.maxEntries;
      const deleteStmt = this.db.prepare(`
        DELETE FROM audit_log WHERE id IN (
          SELECT id FROM audit_log ORDER BY timestamp ASC LIMIT ?
        )
      `);
      deleteStmt.run(toDelete);
    }
  }

  private rowToEntry(row: AuditRow): AuditLogEntry {
    return {
      id: row.id,
      timestamp: new Date(row.timestamp),
      action: row.action as AuditLogEntry['action'],
      actor: {
        type: row.actor_type as AuditLogEntry['actor']['type'],
        id: row.actor_id,
        name: row.actor_name,
        modelId: row.actor_model_id ?? undefined,
        deviceInfo: row.actor_device_info ?? undefined,
      },
      resource: {
        uri: row.resource_uri,
        vaultId: row.resource_vault_id,
        itemId: row.resource_item_id ?? undefined,
        permissionLevel: row.resource_permission_level,
        description: row.resource_description ?? undefined,
      },
      outcome: {
        success: row.outcome_success === 1,
        failureReason: row.outcome_failure_reason ?? undefined,
        approvalMethod: row.outcome_approval_method as AuditLogEntry['outcome']['approvalMethod'],
        accessDuration: row.outcome_access_duration ?? undefined,
      },
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      previousEntryHash: row.previous_entry_hash ?? undefined,
      entryHash: row.entry_hash,
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Export audit log to JSON for backup
   */
  async exportToJSON(): Promise<string> {
    const entries = await this.queryEntries({ limit: 1000000 });
    return JSON.stringify(entries, null, 2);
  }
}

interface AuditRow {
  id: string;
  timestamp: string;
  action: string;
  actor_type: string;
  actor_id: string;
  actor_name: string;
  actor_model_id: string | null;
  actor_device_info: string | null;
  resource_uri: string;
  resource_vault_id: string;
  resource_item_id: string | null;
  resource_permission_level: number;
  resource_description: string | null;
  outcome_success: number;
  outcome_failure_reason: string | null;
  outcome_approval_method: string | null;
  outcome_access_duration: string | null;
  metadata: string | null;
  previous_entry_hash: string | null;
  entry_hash: string;
}
