import type { Permission, PermissionLevel } from './permissions.js';

/**
 * Vault Types - Encrypted data compartments
 */
export enum VaultType {
  Identity = 'identity',
  Finance = 'finance',
  Health = 'health',
  Diary = 'diary',
  Calendar = 'calendar',
  Secrets = 'secrets',
  Custom = 'custom',
}

export interface Vault {
  /** Unique identifier for this vault */
  id: string;
  /** Type of vault */
  type: VaultType;
  /** Human-readable name */
  name: string;
  /** Description of vault contents */
  description?: string;
  /** Default permission level for items in this vault */
  defaultPermissionLevel: PermissionLevel;
  /** Creation timestamp */
  createdAt: Date;
  /** Last modification timestamp */
  updatedAt: Date;
  /** Whether this vault is currently unlocked in memory */
  isUnlocked: boolean;
  /** Vault-level encryption metadata */
  encryptionMetadata: VaultEncryptionMetadata;
}

export interface VaultEncryptionMetadata {
  /** Key derivation algorithm used */
  algorithm: 'argon2id';
  /** Salt for key derivation (base64) */
  salt: string;
  /** Argon2 memory cost in KiB */
  memoryCost: number;
  /** Argon2 time cost (iterations) */
  timeCost: number;
  /** Argon2 parallelism */
  parallelism: number;
  /** Encrypted vault key (encrypted with master key) */
  encryptedVaultKey: string;
  /** Nonce for vault key encryption */
  vaultKeyNonce: string;
}

export interface VaultItem {
  /** Unique identifier for this item */
  id: string;
  /** Vault this item belongs to */
  vaultId: string;
  /** Type of item (e.g., 'transaction', 'record', 'note') */
  itemType: string;
  /** Human-readable title */
  title: string;
  /** Permission overrides for this specific item */
  permission?: Permission;
  /** Creation timestamp */
  createdAt: Date;
  /** Last modification timestamp */
  updatedAt: Date;
  /** Encrypted content (base64) */
  encryptedContent: string;
  /** Nonce for content encryption */
  contentNonce: string;
  /** Optional tags for organization */
  tags?: string[];
  /** MCP resource URI for this item */
  resourceUri: string;
}

export interface DecryptedVaultItem<T = unknown> extends Omit<VaultItem, 'encryptedContent' | 'contentNonce'> {
  /** Decrypted content */
  content: T;
}

/** Finance-specific vault items */
export interface TransactionContent {
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  currency: string;
  category: string;
  subcategory?: string;
  merchant?: string;
  date: string; // ISO 8601
  notes?: string;
  paymentMethod?: string;
  recurring?: boolean;
}

export interface BillContent {
  provider: string;
  accountNumber?: string;
  amount: number;
  currency: string;
  dueDate: string; // ISO 8601
  category: string;
  status: 'pending' | 'paid' | 'overdue';
  invoiceNumber?: string;
  paymentHistory?: Array<{
    date: string;
    amount: number;
  }>;
}

/** Health-specific vault items */
export interface HealthRecordContent {
  type: 'consultation' | 'prescription' | 'test_result' | 'vaccination' | 'procedure';
  provider: string;
  date: string; // ISO 8601
  summary: string;
  details?: string;
  attachments?: string[]; // encrypted file references
}

/** Identity-specific vault items */
export interface IdentityDocumentContent {
  type: 'passport' | 'drivers_license' | 'birth_certificate' | 'tax_file_number' | 'medicare' | 'other';
  documentNumber?: string;
  issuedBy?: string;
  issueDate?: string;
  expiryDate?: string;
  notes?: string;
}

/** Messaging platform types */
export type MessagingPlatform =
  | 'signal'
  | 'whatsapp'
  | 'telegram'
  | 'imessage'
  | 'sms'
  | 'email'
  | 'matrix'
  | 'discord'
  | 'slack';

/** Contact method with platform-specific details */
export interface ContactMethod {
  platform: MessagingPlatform;
  identifier: string;  // phone number, email, username, etc.
  isPrimary?: boolean;
  isVerified?: boolean;
  label?: string;  // e.g., "Personal", "Work"
}

export interface ProfileContent {
  displayName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  languagePreference: string;
  timezone: string;
  /** Preferred messaging/contact methods */
  contactMethods?: ContactMethod[];
  /** Avatar/profile image reference */
  avatarUri?: string;
  /** Bio/about text */
  bio?: string;
}

/** Diary/Notes vault items */
export interface DiaryEntryContent {
  date: string; // ISO 8601
  mood?: string;
  content: string;
  tags?: string[];
}

/** Calendar vault items */
export interface CalendarEventContent {
  title: string;
  description?: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  location?: string;
  attendees?: string[];
  reminders?: Array<{
    type: 'notification' | 'email';
    minutesBefore: number;
  }>;
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval: number;
    until?: string;
  };
}

/** Secrets vault items (Level 3 - Locked) */
export interface SecretContent {
  type: 'password' | 'api_key' | 'private_key' | 'recovery_phrase' | 'other';
  value: string;
  username?: string;
  url?: string;
  notes?: string;
  lastRotated?: string;
}
