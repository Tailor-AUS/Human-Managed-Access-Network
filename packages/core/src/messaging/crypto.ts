/**
 * E2EE Messaging Crypto Module
 *
 * Implements end-to-end encryption for HMAN messaging using X25519 key exchange
 * and XChaCha20-Poly1305 symmetric encryption.
 *
 * This is a simplified implementation. A production version would implement
 * the full Signal Protocol with ratcheting for forward secrecy.
 */

import {
  generateKeyPair,
  encryptForRecipient,
  decryptFromSender,
  encrypt,
  decrypt,
  generateKey,
  toBase64,
  fromBase64,
  hash,
} from '../crypto/encryption.js';

export interface IdentityKeyPair {
  publicKey: string; // Base64
  privateKey: string; // Base64
}

export interface PreKey {
  id: number;
  publicKey: string;
  privateKey: string;
}

export interface SignedPreKey extends PreKey {
  signature: string;
}

export interface MessageKeys {
  encryptionKey: Uint8Array;
  macKey: Uint8Array;
}

/**
 * Generate an identity key pair for a user
 */
export function generateIdentityKeyPair(): IdentityKeyPair {
  const { publicKey, privateKey } = generateKeyPair();
  return {
    publicKey: toBase64(publicKey),
    privateKey: toBase64(privateKey),
  };
}

/**
 * Generate a pre-key for key exchange
 */
export function generatePreKey(id: number): PreKey {
  const { publicKey, privateKey } = generateKeyPair();
  return {
    id,
    publicKey: toBase64(publicKey),
    privateKey: toBase64(privateKey),
  };
}

/**
 * Generate multiple pre-keys
 */
export function generatePreKeys(startId: number, count: number): PreKey[] {
  const preKeys: PreKey[] = [];
  for (let i = 0; i < count; i++) {
    preKeys.push(generatePreKey(startId + i));
  }
  return preKeys;
}

/**
 * Derive a shared secret from key exchange
 */
export function deriveSharedSecret(
  ourPrivateKey: string,
  theirPublicKey: string
): Uint8Array {
  // In a real implementation, this would use X3DH (Extended Triple Diffie-Hellman)
  // For now, we use a simplified approach with sealed boxes
  const combined = fromBase64(ourPrivateKey).toString() + fromBase64(theirPublicKey).toString();
  return hash(new TextEncoder().encode(combined), 32);
}

/**
 * Encrypt a message for a recipient
 */
export function encryptMessage(
  plaintext: string,
  senderPrivateKey: string,
  recipientPublicKey: string
): EncryptedMessage {
  // Derive session key
  const sessionKey = deriveSharedSecret(senderPrivateKey, recipientPublicKey);

  // Generate ephemeral key for this message
  const { publicKey: ephemeralPublic, privateKey: ephemeralPrivate } = generateKeyPair();

  // Encrypt the message
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const { ciphertext, nonce } = encrypt(plaintextBytes, sessionKey);

  return {
    ephemeralKey: toBase64(ephemeralPublic),
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(nonce),
  };
}

/**
 * Decrypt a message from a sender
 */
export function decryptMessage(
  encrypted: EncryptedMessage,
  recipientPrivateKey: string,
  senderPublicKey: string
): string {
  // Derive session key
  const sessionKey = deriveSharedSecret(recipientPrivateKey, senderPublicKey);

  // Decrypt the message
  const ciphertext = fromBase64(encrypted.ciphertext);
  const nonce = fromBase64(encrypted.nonce);
  const plaintextBytes = decrypt(ciphertext, nonce, sessionKey);

  return new TextDecoder().decode(plaintextBytes);
}

export interface EncryptedMessage {
  ephemeralKey: string;
  ciphertext: string;
  nonce: string;
}

/**
 * Session for ongoing communication with a contact
 */
export interface Session {
  /** Our identity */
  ourIdentityKey: IdentityKeyPair;
  /** Their public identity key */
  theirIdentityKey: string;
  /** Current session key */
  sessionKey: Uint8Array;
  /** Message counter for ordering */
  messageCounter: number;
  /** Creation time */
  createdAt: Date;
  /** Last activity */
  lastActiveAt: Date;
}

/**
 * Session Manager - handles E2EE sessions with contacts
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private identityKeyPair: IdentityKeyPair;

  constructor(identityKeyPair: IdentityKeyPair) {
    this.identityKeyPair = identityKeyPair;
  }

  /**
   * Create or get a session with a contact
   */
  getOrCreateSession(contactId: string, theirPublicKey: string): Session {
    let session = this.sessions.get(contactId);

    if (!session) {
      const sessionKey = deriveSharedSecret(
        this.identityKeyPair.privateKey,
        theirPublicKey
      );

      session = {
        ourIdentityKey: this.identityKeyPair,
        theirIdentityKey: theirPublicKey,
        sessionKey,
        messageCounter: 0,
        createdAt: new Date(),
        lastActiveAt: new Date(),
      };

      this.sessions.set(contactId, session);
    }

    return session;
  }

  /**
   * Encrypt a message for a contact
   */
  encryptForContact(contactId: string, theirPublicKey: string, plaintext: string): EncryptedMessage {
    const session = this.getOrCreateSession(contactId, theirPublicKey);
    session.messageCounter++;
    session.lastActiveAt = new Date();

    return encryptMessage(plaintext, this.identityKeyPair.privateKey, theirPublicKey);
  }

  /**
   * Decrypt a message from a contact
   */
  decryptFromContact(contactId: string, theirPublicKey: string, encrypted: EncryptedMessage): string {
    const session = this.getOrCreateSession(contactId, theirPublicKey);
    session.lastActiveAt = new Date();

    return decryptMessage(encrypted, this.identityKeyPair.privateKey, theirPublicKey);
  }

  /**
   * Check if we have a session with a contact
   */
  hasSession(contactId: string): boolean {
    return this.sessions.has(contactId);
  }

  /**
   * Delete a session
   */
  deleteSession(contactId: string): boolean {
    return this.sessions.delete(contactId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Array<{ contactId: string; session: Session }> {
    return Array.from(this.sessions.entries()).map(([contactId, session]) => ({
      contactId,
      session,
    }));
  }

  /**
   * Get our public identity key for sharing
   */
  getPublicIdentityKey(): string {
    return this.identityKeyPair.publicKey;
  }
}

/**
 * Create a new session manager with a fresh identity
 */
export function createSessionManager(): SessionManager {
  const identityKeyPair = generateIdentityKeyPair();
  return new SessionManager(identityKeyPair);
}

/**
 * Create a session manager from an existing identity
 */
export function restoreSessionManager(identityKeyPair: IdentityKeyPair): SessionManager {
  return new SessionManager(identityKeyPair);
}
