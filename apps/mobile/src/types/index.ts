/**
 * Mobile App Types
 */

export enum PermissionLevel {
  Open = 0,
  Standard = 1,
  Gated = 2,
  Locked = 3,
}

export enum VaultType {
  Identity = 'identity',
  Finance = 'finance',
  Health = 'health',
  Diary = 'diary',
  Calendar = 'calendar',
  Secrets = 'secrets',
}

export interface Vault {
  id: string;
  type: VaultType;
  name: string;
  description?: string;
  defaultPermissionLevel: PermissionLevel;
  itemCount: number;
  isUnlocked: boolean;
  icon: string;
}

export interface VaultItem {
  id: string;
  vaultId: string;
  title: string;
  itemType: string;
  permissionLevel: PermissionLevel;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccessRequest {
  id: string;
  requesterName: string;
  requesterType: 'ai_model' | 'bot' | 'delegate';
  resourceUri: string;
  resourceName: string;
  purpose: string;
  timestamp: Date;
  expiresAt: Date;
  status: 'pending' | 'approved' | 'denied' | 'expired';
}

export interface AuditEntry {
  id: string;
  action: string;
  actorName: string;
  actorType: string;
  resourceUri: string;
  success: boolean;
  timestamp: Date;
}
