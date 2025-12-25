/**
 * Crypto Module Tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  initCrypto,
  generateKey,
  generateNonce,
  encrypt,
  decrypt,
  encryptString,
  decryptString,
  encryptJSON,
  decryptJSON,
  encryptKey,
  decryptKey,
  deriveKeyFromPassphrase,
  generateKeyPair,
  encryptForRecipient,
  decryptFromSender,
  hash,
  hashString,
  toBase64,
  fromBase64,
  toHex,
  fromHex,
  randomBytes,
  secureCompare,
} from '../crypto/encryption.js';

describe('Crypto Module', () => {
  beforeAll(async () => {
    await initCrypto();
  });

  describe('Key Generation', () => {
    it('should generate a random key', () => {
      const key = generateKey();
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32); // 256 bits
    });

    it('should generate unique keys', () => {
      const key1 = generateKey();
      const key2 = generateKey();
      expect(toBase64(key1)).not.toBe(toBase64(key2));
    });

    it('should generate a random nonce', () => {
      const nonce = generateNonce();
      expect(nonce).toBeInstanceOf(Uint8Array);
      expect(nonce.length).toBe(24); // XChaCha20 nonce
    });
  });

  describe('Symmetric Encryption', () => {
    it('should encrypt and decrypt bytes', () => {
      const key = generateKey();
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);

      const { ciphertext, nonce } = encrypt(plaintext, key);
      const decrypted = decrypt(ciphertext, nonce, key);

      expect(decrypted).toEqual(plaintext);
    });

    it('should encrypt and decrypt strings', () => {
      const key = generateKey();
      const plaintext = 'Hello, HMAN!';

      const { ciphertext, nonce } = encryptString(plaintext, key);
      const decrypted = decryptString(ciphertext, nonce, key);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt JSON', () => {
      const key = generateKey();
      const data = { name: 'Test', value: 42, nested: { array: [1, 2, 3] } };

      const { ciphertext, nonce } = encryptJSON(data, key);
      const decrypted = decryptJSON(ciphertext, nonce, key);

      expect(decrypted).toEqual(data);
    });

    it('should fail decryption with wrong key', () => {
      const key1 = generateKey();
      const key2 = generateKey();
      const plaintext = 'Secret message';

      const { ciphertext, nonce } = encryptString(plaintext, key1);

      expect(() => decryptString(ciphertext, nonce, key2)).toThrow();
    });

    it('should produce different ciphertext with different nonces', () => {
      const key = generateKey();
      const plaintext = 'Same message';

      const result1 = encryptString(plaintext, key);
      const result2 = encryptString(plaintext, key);

      expect(result1.ciphertext).not.toBe(result2.ciphertext);
      expect(result1.nonce).not.toBe(result2.nonce);
    });
  });

  describe('Key Encryption', () => {
    it('should encrypt and decrypt a key', () => {
      const masterKey = generateKey();
      const vaultKey = generateKey();

      const { encryptedKey, nonce } = encryptKey(vaultKey, masterKey);
      const decrypted = decryptKey(encryptedKey, nonce, masterKey);

      expect(toBase64(decrypted)).toBe(toBase64(vaultKey));
    });
  });

  describe('Key Derivation', () => {
    it('should derive a key from passphrase', async () => {
      const passphrase = 'my-secure-passphrase';

      const { key, salt } = await deriveKeyFromPassphrase(passphrase);

      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
      expect(salt).toBeInstanceOf(Uint8Array);
    });

    it('should derive the same key with same passphrase and salt', async () => {
      const passphrase = 'my-secure-passphrase';

      const { key: key1, salt } = await deriveKeyFromPassphrase(passphrase);
      const { key: key2 } = await deriveKeyFromPassphrase(passphrase, salt);

      expect(toBase64(key1)).toBe(toBase64(key2));
    });

    it('should derive different keys with different passphrases', async () => {
      const { key: key1, salt } = await deriveKeyFromPassphrase('passphrase1');
      const { key: key2 } = await deriveKeyFromPassphrase('passphrase2', salt);

      expect(toBase64(key1)).not.toBe(toBase64(key2));
    });
  });

  describe('Asymmetric Encryption', () => {
    it('should generate a key pair', () => {
      const { publicKey, privateKey } = generateKeyPair();

      expect(publicKey).toBeInstanceOf(Uint8Array);
      expect(privateKey).toBeInstanceOf(Uint8Array);
      expect(publicKey.length).toBe(32);
      expect(privateKey.length).toBe(32);
    });

    it('should encrypt for recipient and decrypt', () => {
      const { publicKey, privateKey } = generateKeyPair();
      const plaintext = new TextEncoder().encode('Secret for recipient');

      const ciphertext = encryptForRecipient(plaintext, publicKey);
      const decrypted = decryptFromSender(ciphertext, publicKey, privateKey);

      expect(new TextDecoder().decode(decrypted)).toBe('Secret for recipient');
    });
  });

  describe('Hashing', () => {
    it('should hash bytes', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const hashed = hash(data);

      expect(hashed).toBeInstanceOf(Uint8Array);
      expect(hashed.length).toBe(32);
    });

    it('should hash strings', () => {
      const hashed = hashString('Hello, World!');

      expect(typeof hashed).toBe('string');
      expect(hashed.length).toBe(64); // hex
    });

    it('should produce consistent hashes', () => {
      const hash1 = hashString('test');
      const hash2 = hashString('test');

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashString('test1');
      const hash2 = hashString('test2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Encoding', () => {
    it('should convert to/from base64', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const base64 = toBase64(data);
      const decoded = fromBase64(base64);

      expect(decoded).toEqual(data);
    });

    it('should convert to/from hex', () => {
      const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      const hex = toHex(data);
      const decoded = fromHex(hex);

      expect(hex).toBe('deadbeef');
      expect(decoded).toEqual(data);
    });
  });

  describe('Random Bytes', () => {
    it('should generate random bytes', () => {
      const bytes = randomBytes(16);

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(16);
    });

    it('should generate different random bytes each time', () => {
      const bytes1 = randomBytes(16);
      const bytes2 = randomBytes(16);

      expect(toBase64(bytes1)).not.toBe(toBase64(bytes2));
    });
  });

  describe('Secure Compare', () => {
    it('should return true for equal arrays', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3]);

      expect(secureCompare(a, b)).toBe(true);
    });

    it('should return false for different arrays', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 4]);

      expect(secureCompare(a, b)).toBe(false);
    });

    it('should return false for different length arrays', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3, 4]);

      expect(secureCompare(a, b)).toBe(false);
    });
  });
});
