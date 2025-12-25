/**
 * HMAN Encryption Module
 *
 * Uses libsodium for all cryptographic operations:
 * - XChaCha20-Poly1305 for symmetric encryption
 * - Argon2id for key derivation
 * - X25519 for key exchange (future: E2EE messaging)
 */

import sodium from 'libsodium-wrappers-sumo';

let initialized = false;

/**
 * Initialize the cryptography module
 * Must be called before any crypto operations
 */
export async function initCrypto(): Promise<void> {
  if (!initialized) {
    await sodium.ready;
    initialized = true;
  }
}

/**
 * Ensure crypto is initialized
 */
function ensureInit(): void {
  if (!initialized) {
    throw new Error('Crypto not initialized. Call initCrypto() first.');
  }
}

/**
 * Key derivation configuration
 */
export interface KeyDerivationConfig {
  /** Memory cost in KiB (default: 64 MiB for interactive) */
  memoryCost: number;
  /** Time cost / iterations (default: 3) */
  timeCost: number;
  /** Parallelism (default: 1) */
  parallelism: number;
}

export const DEFAULT_KEY_DERIVATION_CONFIG: KeyDerivationConfig = {
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 1,
};

/**
 * Derive a master key from a passphrase using Argon2id
 */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt?: Uint8Array,
  config: KeyDerivationConfig = DEFAULT_KEY_DERIVATION_CONFIG
): Promise<{ key: Uint8Array; salt: Uint8Array }> {
  ensureInit();

  // Generate salt if not provided
  const derivationSalt = salt ?? sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);

  // Derive key using Argon2id
  const key = sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    passphrase,
    derivationSalt,
    config.timeCost,
    config.memoryCost * 1024, // Convert KiB to bytes
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );

  return { key, salt: derivationSalt };
}

/**
 * Generate a random encryption key
 */
export function generateKey(): Uint8Array {
  ensureInit();
  return sodium.crypto_secretbox_keygen();
}

/**
 * Generate a random nonce
 */
export function generateNonce(): Uint8Array {
  ensureInit();
  return sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
}

/**
 * Encrypt data using XChaCha20-Poly1305
 */
export function encrypt(plaintext: Uint8Array, key: Uint8Array, nonce?: Uint8Array): { ciphertext: Uint8Array; nonce: Uint8Array } {
  ensureInit();

  const encryptionNonce = nonce ?? generateNonce();
  const ciphertext = sodium.crypto_secretbox_easy(plaintext, encryptionNonce, key);

  return { ciphertext, nonce: encryptionNonce };
}

/**
 * Decrypt data using XChaCha20-Poly1305
 */
export function decrypt(ciphertext: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array {
  ensureInit();

  try {
    return sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
  } catch {
    throw new Error('Decryption failed - invalid key or corrupted data');
  }
}

/**
 * Encrypt a string and return base64-encoded result
 */
export function encryptString(plaintext: string, key: Uint8Array): { ciphertext: string; nonce: string } {
  ensureInit();

  const plaintextBytes = sodium.from_string(plaintext);
  const { ciphertext, nonce } = encrypt(plaintextBytes, key);

  return {
    ciphertext: sodium.to_base64(ciphertext),
    nonce: sodium.to_base64(nonce),
  };
}

/**
 * Decrypt a base64-encoded ciphertext to string
 */
export function decryptString(ciphertext: string, nonce: string, key: Uint8Array): string {
  ensureInit();

  const ciphertextBytes = sodium.from_base64(ciphertext);
  const nonceBytes = sodium.from_base64(nonce);
  const plaintextBytes = decrypt(ciphertextBytes, nonceBytes, key);

  return sodium.to_string(plaintextBytes);
}

/**
 * Encrypt a JSON object
 */
export function encryptJSON<T>(data: T, key: Uint8Array): { ciphertext: string; nonce: string } {
  return encryptString(JSON.stringify(data), key);
}

/**
 * Decrypt to a JSON object
 */
export function decryptJSON<T>(ciphertext: string, nonce: string, key: Uint8Array): T {
  const plaintext = decryptString(ciphertext, nonce, key);
  return JSON.parse(plaintext) as T;
}

/**
 * Encrypt a key with another key (for key hierarchy)
 */
export function encryptKey(keyToEncrypt: Uint8Array, encryptionKey: Uint8Array): { encryptedKey: string; nonce: string } {
  const { ciphertext, nonce } = encrypt(keyToEncrypt, encryptionKey);
  return {
    encryptedKey: sodium.to_base64(ciphertext),
    nonce: sodium.to_base64(nonce),
  };
}

/**
 * Decrypt a key
 */
export function decryptKey(encryptedKey: string, nonce: string, decryptionKey: Uint8Array): Uint8Array {
  const ciphertextBytes = sodium.from_base64(encryptedKey);
  const nonceBytes = sodium.from_base64(nonce);
  return decrypt(ciphertextBytes, nonceBytes, decryptionKey);
}

/**
 * Generate a key pair for asymmetric encryption (E2EE messaging)
 */
export function generateKeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
  ensureInit();
  const keyPair = sodium.crypto_box_keypair();
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Encrypt for a recipient using their public key (sealed box)
 */
export function encryptForRecipient(plaintext: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array {
  ensureInit();
  return sodium.crypto_box_seal(plaintext, recipientPublicKey);
}

/**
 * Decrypt a sealed box message
 */
export function decryptFromSender(ciphertext: Uint8Array, publicKey: Uint8Array, privateKey: Uint8Array): Uint8Array {
  ensureInit();
  try {
    return sodium.crypto_box_seal_open(ciphertext, publicKey, privateKey);
  } catch {
    throw new Error('Decryption failed - invalid keys or corrupted data');
  }
}

/**
 * Hash data using BLAKE2b
 */
export function hash(data: Uint8Array, length: number = 32): Uint8Array {
  ensureInit();
  return sodium.crypto_generichash(length, data);
}

/**
 * Hash a string and return hex
 */
export function hashString(data: string, length: number = 32): string {
  ensureInit();
  const hashBytes = hash(sodium.from_string(data), length);
  return sodium.to_hex(hashBytes);
}

/**
 * Secure memory wipe
 */
export function secureWipe(data: Uint8Array): void {
  ensureInit();
  sodium.memzero(data);
}

/**
 * Convert bytes to base64
 */
export function toBase64(data: Uint8Array): string {
  ensureInit();
  return sodium.to_base64(data);
}

/**
 * Convert base64 to bytes
 */
export function fromBase64(data: string): Uint8Array {
  ensureInit();
  return sodium.from_base64(data);
}

/**
 * Convert bytes to hex
 */
export function toHex(data: Uint8Array): string {
  ensureInit();
  return sodium.to_hex(data);
}

/**
 * Convert hex to bytes
 */
export function fromHex(data: string): Uint8Array {
  ensureInit();
  return sodium.from_hex(data);
}

/**
 * Generate cryptographically secure random bytes
 */
export function randomBytes(length: number): Uint8Array {
  ensureInit();
  return sodium.randombytes_buf(length);
}

/**
 * Constant-time comparison
 */
export function secureCompare(a: Uint8Array, b: Uint8Array): boolean {
  ensureInit();
  if (a.length !== b.length) return false;
  return sodium.compare(a, b) === 0;
}
