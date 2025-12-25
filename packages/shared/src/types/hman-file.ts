/**
 * HMAN File Format Specification
 *
 * .hman files are the standard file format for exporting, backing up,
 * and exchanging data within the Human Managed Access Network ecosystem.
 *
 * File Structure:
 * - Magic bytes: "HMAN" (4 bytes)
 * - Version: uint8 (1 byte)
 * - Flags: uint8 (1 byte) - encryption, compression flags
 * - Header length: uint32 (4 bytes)
 * - Header: JSON (variable length)
 * - Payload: encrypted/compressed data (variable length)
 * - Checksum: SHA-256 (32 bytes)
 */

import { VaultType } from './vault.js';
import { PermissionLevel } from './permissions.js';

// File format constants
export const HMAN_FILE_MAGIC = 'HMAN';
export const HMAN_FILE_VERSION = 1;
export const HMAN_FILE_EXTENSION = '.hman';

// File type identifiers
export enum HmanFileType {
  VaultExport = 'vault_export',
  VaultBackup = 'vault_backup',
  ItemExport = 'item_export',
  DelegationExport = 'delegation_export',
  FullBackup = 'full_backup',
  AuditExport = 'audit_export',
}

// Encryption algorithms supported
export enum HmanEncryption {
  None = 'none',
  AES256GCM = 'aes-256-gcm',
  ChaCha20Poly1305 = 'chacha20-poly1305',
}

// Compression algorithms supported
export enum HmanCompression {
  None = 'none',
  Gzip = 'gzip',
  Brotli = 'brotli',
}

// File flags (bitfield)
export enum HmanFileFlags {
  None = 0,
  Encrypted = 1 << 0,      // 0x01
  Compressed = 1 << 1,     // 0x02
  Signed = 1 << 2,         // 0x04
  Partial = 1 << 3,        // 0x08 - for chunked exports
}

// File header structure
export interface HmanFileHeader {
  // File metadata
  version: number;
  type: HmanFileType;
  createdAt: string;  // ISO 8601
  createdBy: string;  // User identifier or device ID

  // Encryption info (if encrypted)
  encryption?: {
    algorithm: HmanEncryption;
    keyDerivation: 'pbkdf2' | 'argon2id';
    salt: string;      // Base64 encoded
    iterations?: number;
    memorySize?: number;  // For argon2id
  };

  // Compression info (if compressed)
  compression?: {
    algorithm: HmanCompression;
    level?: number;
    originalSize: number;
  };

  // Content metadata
  content: {
    itemCount: number;
    vaultTypes?: VaultType[];
    dateRange?: {
      from: string;
      to: string;
    };
  };

  // Integrity
  checksum: {
    algorithm: 'sha256' | 'sha384' | 'sha512';
    payloadHash: string;  // Base64 encoded
  };

  // Optional signature for verification
  signature?: {
    algorithm: 'ed25519' | 'ecdsa-p256';
    publicKey: string;   // Base64 encoded
    value: string;       // Base64 encoded
  };

  // Extension data for future compatibility
  extensions?: Record<string, unknown>;
}

// Vault export payload structure
export interface HmanVaultExportPayload {
  vault: {
    id: string;
    type: VaultType;
    name: string;
    description?: string;
    defaultPermissionLevel: PermissionLevel;
    createdAt: string;
    updatedAt: string;
  };
  items: HmanExportedItem[];
}

// Item structure in export
export interface HmanExportedItem {
  id: string;
  type: string;
  label: string;
  data: Record<string, unknown>;  // Encrypted or plaintext depending on file encryption
  metadata: {
    createdAt: string;
    updatedAt: string;
    accessCount?: number;
  };
  tags?: string[];
  permissionLevel?: PermissionLevel;
}

// Full backup payload structure
export interface HmanFullBackupPayload {
  vaults: HmanVaultExportPayload[];
  delegations: HmanExportedDelegation[];
  auditLog?: HmanExportedAuditEntry[];
  settings: Record<string, unknown>;
}

// Delegation export structure
export interface HmanExportedDelegation {
  id: string;
  delegateId: string;
  delegateName: string;
  delegateType: 'human' | 'ai_model' | 'service';
  vaultId: string;
  itemIds?: string[];
  permissions: PermissionLevel;
  constraints?: {
    expiresAt?: string;
    usageLimit?: number;
    allowedOperations?: string[];
  };
  createdAt: string;
}

// Audit entry export structure
export interface HmanExportedAuditEntry {
  id: string;
  timestamp: string;
  action: string;
  actorId: string;
  actorName: string;
  actorType: 'human' | 'ai_model' | 'service';
  resourceUri: string;
  outcome: 'success' | 'denied' | 'error';
  details?: Record<string, unknown>;
}

// Parsed file structure
export interface HmanFile<T = unknown> {
  header: HmanFileHeader;
  payload: T;
  isValid: boolean;
  validationErrors?: string[];
}

// File creation options
export interface HmanFileOptions {
  type: HmanFileType;
  encryption?: {
    algorithm: HmanEncryption;
    password?: string;
    publicKey?: string;  // For asymmetric encryption
  };
  compression?: {
    algorithm: HmanCompression;
    level?: number;
  };
  sign?: {
    privateKey: string;
  };
}

// Validation result
export interface HmanFileValidation {
  isValid: boolean;
  errors: HmanValidationError[];
  warnings: HmanValidationWarning[];
}

export interface HmanValidationError {
  code: HmanValidationErrorCode;
  message: string;
  field?: string;
}

export interface HmanValidationWarning {
  code: string;
  message: string;
  field?: string;
}

export enum HmanValidationErrorCode {
  InvalidMagic = 'INVALID_MAGIC',
  UnsupportedVersion = 'UNSUPPORTED_VERSION',
  InvalidHeader = 'INVALID_HEADER',
  ChecksumMismatch = 'CHECKSUM_MISMATCH',
  DecryptionFailed = 'DECRYPTION_FAILED',
  DecompressionFailed = 'DECOMPRESSION_FAILED',
  InvalidPayload = 'INVALID_PAYLOAD',
  SignatureInvalid = 'SIGNATURE_INVALID',
  ExpiredFile = 'EXPIRED_FILE',
  MissingRequiredField = 'MISSING_REQUIRED_FIELD',
}
