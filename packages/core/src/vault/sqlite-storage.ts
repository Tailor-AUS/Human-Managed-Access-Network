/**
 * SQLite Storage Backend for HMAN Vaults
 *
 * Uses better-sqlite3 for persistent storage.
 * In production, this should use SQLCipher for encryption at rest.
 */

import Database from 'better-sqlite3';
import type { Vault, VaultItem } from '@hman/shared';
import type { VaultKeyData } from '../crypto/index.js';
import type { VaultStorage, ItemQuery } from './vault-manager.js';

/** Error class for storage-related errors */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/** Maximum allowed limit for queries */
const MAX_QUERY_LIMIT = 1000;
/** Default limit for queries */
const DEFAULT_QUERY_LIMIT = 100;

export interface SQLiteStorageConfig {
  /** Path to the database file */
  dbPath: string;
  /** Enable WAL mode for better concurrency */
  walMode?: boolean;
}

export class SQLiteVaultStorage implements VaultStorage {
  private db: Database.Database;

  constructor(config: SQLiteStorageConfig) {
    this.db = new Database(config.dbPath);

    if (config.walMode !== false) {
      this.db.pragma('journal_mode = WAL');
    }

    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      -- Vaults table
      CREATE TABLE IF NOT EXISTS vaults (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        default_permission_level INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_unlocked INTEGER NOT NULL DEFAULT 0,
        encryption_metadata TEXT NOT NULL
      );

      -- Vault keys table
      CREATE TABLE IF NOT EXISTS vault_keys (
        vault_id TEXT PRIMARY KEY,
        encrypted_key TEXT NOT NULL,
        nonce TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
      );

      -- Vault items table
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        vault_id TEXT NOT NULL,
        item_type TEXT NOT NULL,
        title TEXT NOT NULL,
        permission TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        encrypted_content TEXT NOT NULL,
        content_nonce TEXT NOT NULL,
        tags TEXT,
        resource_uri TEXT NOT NULL,
        FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_items_vault ON items(vault_id);
      CREATE INDEX IF NOT EXISTS idx_items_type ON items(vault_id, item_type);
      CREATE INDEX IF NOT EXISTS idx_items_created ON items(created_at);
    `);
  }

  /**
   * Safely parse JSON with error handling
   */
  private safeParseJSON<T>(json: string, field: string, defaultValue?: T): T {
    if (!json) {
      if (defaultValue !== undefined) return defaultValue;
      throw new StorageError(`Missing JSON data for ${field}`, 'parseJSON');
    }
    try {
      return JSON.parse(json) as T;
    } catch (err) {
      if (defaultValue !== undefined) return defaultValue;
      throw new StorageError(
        `Invalid JSON in ${field}: ${err instanceof Error ? err.message : 'Parse error'}`,
        'parseJSON',
        err instanceof Error ? err : undefined
      );
    }
  }

  // Vault operations

  async saveVault(vault: Vault): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO vaults
        (id, type, name, description, default_permission_level, created_at, updated_at, is_unlocked, encryption_metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        vault.id,
        vault.type,
        vault.name,
        vault.description ?? null,
        vault.defaultPermissionLevel,
        vault.createdAt.toISOString(),
        vault.updatedAt.toISOString(),
        vault.isUnlocked ? 1 : 0,
        JSON.stringify(vault.encryptionMetadata)
      );
    } catch (err) {
      throw new StorageError(
        `Failed to save vault ${vault.id}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'saveVault',
        err instanceof Error ? err : undefined
      );
    }
  }

  async getVault(vaultId: string): Promise<Vault | null> {
    try {
      const stmt = this.db.prepare('SELECT * FROM vaults WHERE id = ?');
      const row = stmt.get(vaultId) as VaultRow | undefined;

      if (!row) return null;
      return this.rowToVault(row);
    } catch (err) {
      throw new StorageError(
        `Failed to get vault ${vaultId}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'getVault',
        err instanceof Error ? err : undefined
      );
    }
  }

  async getAllVaults(): Promise<Vault[]> {
    try {
      const stmt = this.db.prepare('SELECT * FROM vaults ORDER BY created_at');
      const rows = stmt.all() as VaultRow[];
      return rows.map(row => this.rowToVault(row));
    } catch (err) {
      throw new StorageError(
        `Failed to get all vaults: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'getAllVaults',
        err instanceof Error ? err : undefined
      );
    }
  }

  async deleteVault(vaultId: string): Promise<void> {
    try {
      const stmt = this.db.prepare('DELETE FROM vaults WHERE id = ?');
      stmt.run(vaultId);
    } catch (err) {
      throw new StorageError(
        `Failed to delete vault ${vaultId}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'deleteVault',
        err instanceof Error ? err : undefined
      );
    }
  }

  private rowToVault(row: VaultRow): Vault {
    return {
      id: row.id,
      type: row.type as Vault['type'],
      name: row.name,
      description: row.description ?? undefined,
      defaultPermissionLevel: row.default_permission_level,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      isUnlocked: row.is_unlocked === 1,
      encryptionMetadata: this.safeParseJSON(row.encryption_metadata, 'encryptionMetadata'),
    };
  }

  // Vault key operations

  async saveVaultKey(vaultKey: VaultKeyData): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO vault_keys (vault_id, encrypted_key, nonce, created_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      vaultKey.vaultId,
      vaultKey.encryptedKey,
      vaultKey.nonce,
      vaultKey.createdAt
    );
  }

  async getVaultKey(vaultId: string): Promise<VaultKeyData | null> {
    const stmt = this.db.prepare('SELECT * FROM vault_keys WHERE vault_id = ?');
    const row = stmt.get(vaultId) as VaultKeyRow | undefined;

    if (!row) return null;

    return {
      vaultId: row.vault_id,
      encryptedKey: row.encrypted_key,
      nonce: row.nonce,
      createdAt: row.created_at,
    };
  }

  async getAllVaultKeys(): Promise<VaultKeyData[]> {
    const stmt = this.db.prepare('SELECT * FROM vault_keys');
    const rows = stmt.all() as VaultKeyRow[];

    return rows.map(row => ({
      vaultId: row.vault_id,
      encryptedKey: row.encrypted_key,
      nonce: row.nonce,
      createdAt: row.created_at,
    }));
  }

  // Item operations

  async saveItem(item: VaultItem): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO items
        (id, vault_id, item_type, title, permission, created_at, updated_at, encrypted_content, content_nonce, tags, resource_uri)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        item.id,
        item.vaultId,
        item.itemType,
        item.title,
        item.permission ? JSON.stringify(item.permission) : null,
        item.createdAt.toISOString(),
        item.updatedAt.toISOString(),
        item.encryptedContent,
        item.contentNonce,
        item.tags ? JSON.stringify(item.tags) : null,
        item.resourceUri
      );
    } catch (err) {
      throw new StorageError(
        `Failed to save item ${item.id}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'saveItem',
        err instanceof Error ? err : undefined
      );
    }
  }

  async getItem(itemId: string): Promise<VaultItem | null> {
    try {
      const stmt = this.db.prepare('SELECT * FROM items WHERE id = ?');
      const row = stmt.get(itemId) as ItemRow | undefined;

      if (!row) return null;
      return this.rowToItem(row);
    } catch (err) {
      throw new StorageError(
        `Failed to get item ${itemId}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'getItem',
        err instanceof Error ? err : undefined
      );
    }
  }

  async getItemsByVault(vaultId: string): Promise<VaultItem[]> {
    try {
      const stmt = this.db.prepare('SELECT * FROM items WHERE vault_id = ? ORDER BY created_at DESC');
      const rows = stmt.all(vaultId) as ItemRow[];
      return rows.map(row => this.rowToItem(row));
    } catch (err) {
      throw new StorageError(
        `Failed to get items for vault ${vaultId}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'getItemsByVault',
        err instanceof Error ? err : undefined
      );
    }
  }

  async getItemsByType(vaultId: string, itemType: string): Promise<VaultItem[]> {
    try {
      const stmt = this.db.prepare(
        'SELECT * FROM items WHERE vault_id = ? AND item_type = ? ORDER BY created_at DESC'
      );
      const rows = stmt.all(vaultId, itemType) as ItemRow[];
      return rows.map(row => this.rowToItem(row));
    } catch (err) {
      throw new StorageError(
        `Failed to get items of type ${itemType} for vault ${vaultId}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'getItemsByType',
        err instanceof Error ? err : undefined
      );
    }
  }

  async queryItems(query: ItemQuery): Promise<VaultItem[]> {
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (query.vaultId) {
        conditions.push('vault_id = ?');
        params.push(query.vaultId);
      }

      if (query.itemType) {
        conditions.push('item_type = ?');
        params.push(query.itemType);
      }

      if (query.createdAfter) {
        conditions.push('created_at >= ?');
        params.push(query.createdAfter.toISOString());
      }

      if (query.createdBefore) {
        conditions.push('created_at <= ?');
        params.push(query.createdBefore.toISOString());
      }

      let sql = 'SELECT * FROM items';
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      sql += ' ORDER BY created_at DESC';

      // Validate and bound pagination parameters
      let limit = query.limit ?? DEFAULT_QUERY_LIMIT;
      let offset = query.offset ?? 0;

      // Enforce bounds
      if (limit < 0) limit = DEFAULT_QUERY_LIMIT;
      if (limit > MAX_QUERY_LIMIT) limit = MAX_QUERY_LIMIT;
      if (offset < 0) offset = 0;

      sql += ` LIMIT ${limit} OFFSET ${offset}`;

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params) as ItemRow[];

      let items = rows.map(row => this.rowToItem(row));

      // Filter by tags in memory (SQLite JSON support is limited)
      if (query.tags && query.tags.length > 0) {
        items = items.filter(item =>
          item.tags && query.tags!.some(tag => item.tags!.includes(tag))
        );
      }

      return items;
    } catch (err) {
      throw new StorageError(
        `Failed to query items: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'queryItems',
        err instanceof Error ? err : undefined
      );
    }
  }

  async deleteItem(itemId: string): Promise<void> {
    try {
      const stmt = this.db.prepare('DELETE FROM items WHERE id = ?');
      stmt.run(itemId);
    } catch (err) {
      throw new StorageError(
        `Failed to delete item ${itemId}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'deleteItem',
        err instanceof Error ? err : undefined
      );
    }
  }

  private rowToItem(row: ItemRow): VaultItem {
    return {
      id: row.id,
      vaultId: row.vault_id,
      itemType: row.item_type,
      title: row.title,
      permission: this.safeParseJSON(row.permission, 'permission', undefined),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      encryptedContent: row.encrypted_content,
      contentNonce: row.content_nonce,
      tags: this.safeParseJSON<string[] | undefined>(row.tags, 'tags', undefined),
      resourceUri: row.resource_uri,
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get database statistics
   */
  getStats(): { vaultCount: number; itemCount: number; dbSize: number } {
    const vaultCount = (this.db.prepare('SELECT COUNT(*) as count FROM vaults').get() as { count: number }).count;
    const itemCount = (this.db.prepare('SELECT COUNT(*) as count FROM items').get() as { count: number }).count;
    const dbSize = (this.db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get() as { size: number }).size;

    return { vaultCount, itemCount, dbSize };
  }
}

// Type definitions for database rows
interface VaultRow {
  id: string;
  type: string;
  name: string;
  description: string | null;
  default_permission_level: number;
  created_at: string;
  updated_at: string;
  is_unlocked: number;
  encryption_metadata: string;
}

interface VaultKeyRow {
  vault_id: string;
  encrypted_key: string;
  nonce: string;
  created_at: string;
}

interface ItemRow {
  id: string;
  vault_id: string;
  item_type: string;
  title: string;
  permission: string | null;
  created_at: string;
  updated_at: string;
  encrypted_content: string;
  content_nonce: string;
  tags: string | null;
  resource_uri: string;
}
