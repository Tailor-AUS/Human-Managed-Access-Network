/**
 * Pure Ed25519 primitives for entity signing keys.
 *
 * Each entity has a detached-signing keypair used to sign Peer
 * Protocol messages. This module has no key-management state — the
 * secret-key lifecycle (seal/unseal/cache/wipe) lives on KeyManager.
 */

import sodium from 'libsodium-wrappers-sumo';
import { toBase64, fromBase64 } from '../crypto/encryption.js';

export interface Ed25519KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/**
 * Generate a new Ed25519 signing keypair.
 * Caller owns both buffers — secretKey must be wiped when finished.
 */
export function generateEntityKeyPair(): Ed25519KeyPair {
  const kp = sodium.crypto_sign_keypair();
  return {
    publicKey: kp.publicKey,
    secretKey: kp.privateKey,
  };
}

/**
 * Detached Ed25519 signature over `message` using a secret key in memory.
 * Returns the signature as base64.
 */
export function signDetachedEd25519(
  message: Uint8Array,
  secretKey: Uint8Array
): string {
  const sig = sodium.crypto_sign_detached(message, secretKey);
  return toBase64(sig);
}

/**
 * Verify a detached Ed25519 signature over `message` using a
 * base64-encoded public key. Never throws — returns false on any
 * malformed input or verification failure.
 */
export function verifyDetachedEd25519(
  message: Uint8Array,
  signatureBase64: string,
  publicKeyBase64: string
): boolean {
  try {
    const sig = fromBase64(signatureBase64);
    const pub = fromBase64(publicKeyBase64);
    return sodium.crypto_sign_verify_detached(sig, message, pub);
  } catch {
    return false;
  }
}
