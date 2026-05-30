/**
 * Zero-dependency reference crypto backend over Node's built-in Ed25519.
 *
 * Public keys are the raw 32-byte point, base64url-encoded (the JWK `x`
 * value), so they are portable to any Ed25519 verifier — including browser
 * WebCrypto. Secret keys are kept as PKCS#8 DER (base64url) and never leave
 * the {@link MemoryKeyStore}.
 *
 * For production you would replace this with an HSM/KMS-backed
 * {@link SignerProvider}; the rest of the library is unaffected.
 */

import {
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
  createPrivateKey,
  createPublicKey,
} from 'node:crypto';
import type { Alg, Signer, SignerProvider, Verifier } from './signer.js';

export interface Ed25519KeyPair {
  keyId: string;
  /** base64url raw public key. */
  publicKey: string;
  /** base64url PKCS#8 DER secret key — keep private. */
  secretKey: string;
  alg: Alg;
}

/** Generate a fresh Ed25519 keypair tagged with `keyId`. */
export function generateEd25519(keyId: string): Ed25519KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' }) as { x?: string };
  const der = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;
  if (!jwk.x) throw new Error('failed to export Ed25519 public key');
  return { keyId, publicKey: jwk.x, secretKey: der.toString('base64url'), alg: 'ed25519' };
}

/** A {@link Signer} backed by an in-memory PKCS#8 secret key. */
export class Ed25519Signer implements Signer {
  readonly alg: Alg = 'ed25519';
  constructor(
    readonly keyId: string,
    readonly publicKey: string,
    private readonly secretKey: string
  ) {}

  async sign(message: Uint8Array): Promise<string> {
    const key = createPrivateKey({
      key: Buffer.from(this.secretKey, 'base64url'),
      format: 'der',
      type: 'pkcs8',
    });
    return nodeSign(null, Buffer.from(message), key).toString('base64url');
  }
}

/** Stateless Ed25519 {@link Verifier}. */
export class Ed25519Verifier implements Verifier {
  async verify(
    message: Uint8Array,
    signature: string,
    publicKey: string,
    alg: Alg = 'ed25519'
  ): Promise<boolean> {
    if (alg !== 'ed25519') return false;
    try {
      const pub = createPublicKey({
        key: { kty: 'OKP', crv: 'Ed25519', x: publicKey },
        format: 'jwk',
      });
      return nodeVerify(null, Buffer.from(message), pub, Buffer.from(signature, 'base64url'));
    } catch {
      return false;
    }
  }
}

/**
 * In-memory keystore implementing {@link SignerProvider}. Suitable for tests,
 * single-process deployments, and as a template for real backends.
 */
export class MemoryKeyStore implements SignerProvider {
  private keys = new Map<string, Ed25519KeyPair>();

  /** Create and store a new keypair for `keyId`, returning it. */
  create(keyId: string): Ed25519KeyPair {
    const kp = generateEd25519(keyId);
    this.keys.set(keyId, kp);
    return kp;
  }

  /** Adopt an externally-generated keypair. */
  add(keyPair: Ed25519KeyPair): void {
    this.keys.set(keyPair.keyId, keyPair);
  }

  has(keyId: string): boolean {
    return this.keys.has(keyId);
  }

  publicKeyOf(keyId: string): string | undefined {
    return this.keys.get(keyId)?.publicKey;
  }

  async getSigner(keyId: string): Promise<Signer | undefined> {
    const kp = this.keys.get(keyId);
    return kp ? new Ed25519Signer(kp.keyId, kp.publicKey, kp.secretKey) : undefined;
  }
}
