/**
 * HMAN File Format Utilities
 *
 * Provides functions for creating, reading, validating, and writing .hman files.
 */

import { createHash, randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import {
  HMAN_FILE_MAGIC,
  HMAN_FILE_VERSION,
  HmanFileType,
  HmanEncryption,
  HmanCompression,
  HmanFileFlags,
  HmanValidationErrorCode,
  type HmanFileHeader,
  type HmanFile,
  type HmanFileOptions,
  type HmanFileValidation,
  type HmanValidationError,
  type HmanValidationWarning,
} from '@hman/shared';

// Error class for file operations
export class HmanFileError extends Error {
  constructor(
    message: string,
    public readonly code: HmanValidationErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'HmanFileError';
  }
}

// Constants for encryption
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;  // For AES-256-GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Create a .hman file buffer from payload data
 */
export async function createHmanFile<T>(
  payload: T,
  options: HmanFileOptions,
  createdBy: string
): Promise<Buffer> {
  // Serialize payload to JSON
  let payloadBuffer = Buffer.from(JSON.stringify(payload), 'utf-8');
  const originalSize = payloadBuffer.length;

  // Calculate flags
  let flags = HmanFileFlags.None;
  let compressionInfo: HmanFileHeader['compression'] | undefined;
  let encryptionInfo: HmanFileHeader['encryption'] | undefined;

  // Apply compression if requested
  if (options.compression && options.compression.algorithm !== HmanCompression.None) {
    flags |= HmanFileFlags.Compressed;

    if (options.compression.algorithm === HmanCompression.Gzip) {
      payloadBuffer = gzipSync(payloadBuffer, { level: options.compression.level ?? 6 });
      compressionInfo = {
        algorithm: HmanCompression.Gzip,
        level: options.compression.level ?? 6,
        originalSize,
      };
    } else {
      throw new HmanFileError(
        `Unsupported compression algorithm: ${options.compression.algorithm}`,
        HmanValidationErrorCode.DecompressionFailed
      );
    }
  }

  // Apply encryption if requested
  if (options.encryption && options.encryption.algorithm !== HmanEncryption.None) {
    if (!options.encryption.password) {
      throw new HmanFileError(
        'Password required for encryption',
        HmanValidationErrorCode.DecryptionFailed
      );
    }

    flags |= HmanFileFlags.Encrypted;

    if (options.encryption.algorithm === HmanEncryption.AES256GCM) {
      const salt = randomBytes(SALT_LENGTH);
      const key = pbkdf2Sync(options.encryption.password, salt, PBKDF2_ITERATIONS, 32, 'sha256');
      const iv = randomBytes(IV_LENGTH);

      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(payloadBuffer), cipher.final()]);
      const authTag = cipher.getAuthTag();

      // Prepend IV and auth tag to encrypted data
      payloadBuffer = Buffer.concat([iv, authTag, encrypted]);

      encryptionInfo = {
        algorithm: HmanEncryption.AES256GCM,
        keyDerivation: 'pbkdf2',
        salt: salt.toString('base64'),
        iterations: PBKDF2_ITERATIONS,
      };
    } else {
      throw new HmanFileError(
        `Unsupported encryption algorithm: ${options.encryption.algorithm}`,
        HmanValidationErrorCode.DecryptionFailed
      );
    }
  }

  // Calculate payload hash
  const payloadHash = createHash('sha256').update(payloadBuffer).digest('base64');

  // Create header
  const header: HmanFileHeader = {
    version: HMAN_FILE_VERSION,
    type: options.type,
    createdAt: new Date().toISOString(),
    createdBy,
    encryption: encryptionInfo,
    compression: compressionInfo,
    content: {
      itemCount: Array.isArray(payload) ? payload.length : 1,
    },
    checksum: {
      algorithm: 'sha256',
      payloadHash,
    },
  };

  // Serialize header
  const headerBuffer = Buffer.from(JSON.stringify(header), 'utf-8');

  // Build file structure:
  // Magic (4) + Version (1) + Flags (1) + Header Length (4) + Header + Payload
  const magicBuffer = Buffer.from(HMAN_FILE_MAGIC, 'ascii');
  const versionBuffer = Buffer.alloc(1);
  versionBuffer.writeUInt8(HMAN_FILE_VERSION);
  const flagsBuffer = Buffer.alloc(1);
  flagsBuffer.writeUInt8(flags);
  const headerLengthBuffer = Buffer.alloc(4);
  headerLengthBuffer.writeUInt32LE(headerBuffer.length);

  return Buffer.concat([
    magicBuffer,
    versionBuffer,
    flagsBuffer,
    headerLengthBuffer,
    headerBuffer,
    payloadBuffer,
  ]);
}

/**
 * Parse a .hman file buffer
 */
export async function parseHmanFile<T>(
  buffer: Buffer,
  password?: string
): Promise<HmanFile<T>> {
  const errors: HmanValidationError[] = [];

  // Validate minimum size
  if (buffer.length < 10) {
    errors.push({
      code: HmanValidationErrorCode.InvalidHeader,
      message: 'File too small to be a valid .hman file',
    });
    return { header: {} as HmanFileHeader, payload: null as T, isValid: false, validationErrors: errors.map(e => e.message) };
  }

  // Read magic bytes
  const magic = buffer.subarray(0, 4).toString('ascii');
  if (magic !== HMAN_FILE_MAGIC) {
    errors.push({
      code: HmanValidationErrorCode.InvalidMagic,
      message: `Invalid magic bytes: expected "${HMAN_FILE_MAGIC}", got "${magic}"`,
    });
    return { header: {} as HmanFileHeader, payload: null as T, isValid: false, validationErrors: errors.map(e => e.message) };
  }

  // Read version
  const version = buffer.readUInt8(4);
  if (version > HMAN_FILE_VERSION) {
    errors.push({
      code: HmanValidationErrorCode.UnsupportedVersion,
      message: `Unsupported file version: ${version} (max supported: ${HMAN_FILE_VERSION})`,
    });
    return { header: {} as HmanFileHeader, payload: null as T, isValid: false, validationErrors: errors.map(e => e.message) };
  }

  // Read flags
  const flags = buffer.readUInt8(5);

  // Read header length
  const headerLength = buffer.readUInt32LE(6);
  if (headerLength > buffer.length - 10) {
    errors.push({
      code: HmanValidationErrorCode.InvalidHeader,
      message: 'Invalid header length',
    });
    return { header: {} as HmanFileHeader, payload: null as T, isValid: false, validationErrors: errors.map(e => e.message) };
  }

  // Parse header
  let header: HmanFileHeader;
  try {
    const headerBuffer = buffer.subarray(10, 10 + headerLength);
    header = JSON.parse(headerBuffer.toString('utf-8'));
  } catch (err) {
    errors.push({
      code: HmanValidationErrorCode.InvalidHeader,
      message: 'Failed to parse header JSON',
    });
    return { header: {} as HmanFileHeader, payload: null as T, isValid: false, validationErrors: errors.map(e => e.message) };
  }

  // Extract payload
  let payloadBuffer = buffer.subarray(10 + headerLength);

  // Verify checksum before decryption
  const computedHash = createHash('sha256').update(payloadBuffer).digest('base64');
  if (computedHash !== header.checksum.payloadHash) {
    errors.push({
      code: HmanValidationErrorCode.ChecksumMismatch,
      message: 'Payload checksum verification failed',
    });
    return { header, payload: null as T, isValid: false, validationErrors: errors.map(e => e.message) };
  }

  // Decrypt if needed
  if (flags & HmanFileFlags.Encrypted) {
    if (!password) {
      errors.push({
        code: HmanValidationErrorCode.DecryptionFailed,
        message: 'Password required to decrypt file',
      });
      return { header, payload: null as T, isValid: false, validationErrors: errors.map(e => e.message) };
    }

    if (header.encryption?.algorithm === HmanEncryption.AES256GCM) {
      try {
        const salt = Buffer.from(header.encryption.salt, 'base64');
        const iterations = header.encryption.iterations ?? PBKDF2_ITERATIONS;
        const key = pbkdf2Sync(password, salt, iterations, 32, 'sha256');

        // Extract IV, auth tag, and ciphertext
        const iv = payloadBuffer.subarray(0, IV_LENGTH);
        const authTag = payloadBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
        const ciphertext = payloadBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        payloadBuffer = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      } catch (err) {
        errors.push({
          code: HmanValidationErrorCode.DecryptionFailed,
          message: 'Failed to decrypt file (wrong password or corrupted data)',
        });
        return { header, payload: null as T, isValid: false, validationErrors: errors.map(e => e.message) };
      }
    }
  }

  // Decompress if needed
  if (flags & HmanFileFlags.Compressed) {
    if (header.compression?.algorithm === HmanCompression.Gzip) {
      try {
        payloadBuffer = gunzipSync(payloadBuffer);
      } catch (err) {
        errors.push({
          code: HmanValidationErrorCode.DecompressionFailed,
          message: 'Failed to decompress file',
        });
        return { header, payload: null as T, isValid: false, validationErrors: errors.map(e => e.message) };
      }
    }
  }

  // Parse payload
  let payload: T;
  try {
    payload = JSON.parse(payloadBuffer.toString('utf-8'));
  } catch (err) {
    errors.push({
      code: HmanValidationErrorCode.InvalidPayload,
      message: 'Failed to parse payload JSON',
    });
    return { header, payload: null as T, isValid: false, validationErrors: errors.map(e => e.message) };
  }

  return {
    header,
    payload,
    isValid: true,
  };
}

/**
 * Validate a .hman file buffer without fully parsing it
 */
export function validateHmanFile(buffer: Buffer): HmanFileValidation {
  const errors: HmanValidationError[] = [];
  const warnings: HmanValidationWarning[] = [];

  // Check minimum size
  if (buffer.length < 10) {
    errors.push({
      code: HmanValidationErrorCode.InvalidHeader,
      message: 'File too small to be a valid .hman file',
    });
    return { isValid: false, errors, warnings };
  }

  // Check magic
  const magic = buffer.subarray(0, 4).toString('ascii');
  if (magic !== HMAN_FILE_MAGIC) {
    errors.push({
      code: HmanValidationErrorCode.InvalidMagic,
      message: `Invalid magic bytes: expected "${HMAN_FILE_MAGIC}", got "${magic}"`,
    });
    return { isValid: false, errors, warnings };
  }

  // Check version
  const version = buffer.readUInt8(4);
  if (version > HMAN_FILE_VERSION) {
    errors.push({
      code: HmanValidationErrorCode.UnsupportedVersion,
      message: `Unsupported file version: ${version}`,
    });
    return { isValid: false, errors, warnings };
  }

  // Check header length
  const headerLength = buffer.readUInt32LE(6);
  if (headerLength > buffer.length - 10 || headerLength > 1024 * 1024) {
    errors.push({
      code: HmanValidationErrorCode.InvalidHeader,
      message: 'Invalid header length',
    });
    return { isValid: false, errors, warnings };
  }

  // Try to parse header
  try {
    const headerBuffer = buffer.subarray(10, 10 + headerLength);
    const header = JSON.parse(headerBuffer.toString('utf-8')) as HmanFileHeader;

    // Validate required header fields
    if (!header.version || !header.type || !header.createdAt || !header.checksum) {
      errors.push({
        code: HmanValidationErrorCode.MissingRequiredField,
        message: 'Header missing required fields',
      });
    }

    // Check for valid file type
    if (!Object.values(HmanFileType).includes(header.type)) {
      warnings.push({
        code: 'UNKNOWN_FILE_TYPE',
        message: `Unknown file type: ${header.type}`,
        field: 'type',
      });
    }

    // Verify payload checksum
    const payloadBuffer = buffer.subarray(10 + headerLength);
    const computedHash = createHash('sha256').update(payloadBuffer).digest('base64');
    if (computedHash !== header.checksum.payloadHash) {
      errors.push({
        code: HmanValidationErrorCode.ChecksumMismatch,
        message: 'Payload checksum verification failed',
      });
    }
  } catch (err) {
    errors.push({
      code: HmanValidationErrorCode.InvalidHeader,
      message: 'Failed to parse header',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get metadata from a .hman file without decrypting payload
 */
export function getHmanFileMetadata(buffer: Buffer): HmanFileHeader | null {
  if (buffer.length < 10) {
    return null;
  }

  const magic = buffer.subarray(0, 4).toString('ascii');
  if (magic !== HMAN_FILE_MAGIC) {
    return null;
  }

  const headerLength = buffer.readUInt32LE(6);
  if (headerLength > buffer.length - 10) {
    return null;
  }

  try {
    const headerBuffer = buffer.subarray(10, 10 + headerLength);
    return JSON.parse(headerBuffer.toString('utf-8'));
  } catch {
    return null;
  }
}

/**
 * Check if a buffer is a valid .hman file
 */
export function isHmanFile(buffer: Buffer): boolean {
  if (buffer.length < 4) {
    return false;
  }
  return buffer.subarray(0, 4).toString('ascii') === HMAN_FILE_MAGIC;
}

/**
 * Get the file extension for a given file type
 */
export function getHmanFileExtension(_type: HmanFileType): string {
  return '.hman';
}

/**
 * Get suggested filename for export
 */
export function getHmanExportFilename(type: HmanFileType, name?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const baseName = name ? name.toLowerCase().replace(/[^a-z0-9]/g, '-') : type.replace('_', '-');
  return `${baseName}-${timestamp}.hman`;
}
