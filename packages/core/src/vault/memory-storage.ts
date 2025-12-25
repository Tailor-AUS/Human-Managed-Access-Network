/**
 * In-memory storage implementation
 * Useful for testing and demos
 */

import type { Vault, VaultItem } from '@hman/shared';
import type { VaultKeyData } from '../crypto/index.js';
import type { VaultStorage, ItemQuery } from './vault-manager.js';

export class MemoryVaultStorage implements VaultStorage {
  private vaults: Map<string, Vault> = new Map();
  private vaultKeys: Map<string, VaultKeyData> = new Map();
  private items: Map<string, VaultItem> = new Map();

  async saveVault(vault: Vault): Promise<void> {
    this.vaults.set(vault.id, { ...vault });
  }

  async getVault(vaultId: string): Promise<Vault | null> {
    const vault = this.vaults.get(vaultId);
    return vault ? { ...vault } : null;
  }

  async getAllVaults(): Promise<Vault[]> {
    return Array.from(this.vaults.values()).map(v => ({ ...v }));
  }

  async deleteVault(vaultId: string): Promise<void> {
    this.vaults.delete(vaultId);
    this.vaultKeys.delete(vaultId);
  }

  async saveVaultKey(vaultKey: VaultKeyData): Promise<void> {
    this.vaultKeys.set(vaultKey.vaultId, { ...vaultKey });
  }

  async getVaultKey(vaultId: string): Promise<VaultKeyData | null> {
    const key = this.vaultKeys.get(vaultId);
    return key ? { ...key } : null;
  }

  async getAllVaultKeys(): Promise<VaultKeyData[]> {
    return Array.from(this.vaultKeys.values()).map(k => ({ ...k }));
  }

  async saveItem(item: VaultItem): Promise<void> {
    this.items.set(item.id, { ...item });
  }

  async getItem(itemId: string): Promise<VaultItem | null> {
    const item = this.items.get(itemId);
    return item ? { ...item } : null;
  }

  async getItemsByVault(vaultId: string): Promise<VaultItem[]> {
    return Array.from(this.items.values())
      .filter(item => item.vaultId === vaultId)
      .map(item => ({ ...item }));
  }

  async getItemsByType(vaultId: string, itemType: string): Promise<VaultItem[]> {
    return Array.from(this.items.values())
      .filter(item => item.vaultId === vaultId && item.itemType === itemType)
      .map(item => ({ ...item }));
  }

  async queryItems(query: ItemQuery): Promise<VaultItem[]> {
    let items = Array.from(this.items.values());

    if (query.vaultId) {
      items = items.filter(item => item.vaultId === query.vaultId);
    }

    if (query.itemType) {
      items = items.filter(item => item.itemType === query.itemType);
    }

    if (query.tags && query.tags.length > 0) {
      items = items.filter(item =>
        item.tags && query.tags!.some(tag => item.tags!.includes(tag))
      );
    }

    if (query.createdAfter) {
      items = items.filter(item => item.createdAt >= query.createdAfter!);
    }

    if (query.createdBefore) {
      items = items.filter(item => item.createdAt <= query.createdBefore!);
    }

    // Sort by creation date descending
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply pagination
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    items = items.slice(offset, offset + limit);

    return items.map(item => ({ ...item }));
  }

  async deleteItem(itemId: string): Promise<void> {
    this.items.delete(itemId);
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.vaults.clear();
    this.vaultKeys.clear();
    this.items.clear();
  }
}
