/**
 * Signer / Verifier ports — the seam that keeps this library crypto-agnostic.
 *
 * The library never imports a specific crypto implementation in its core
 * logic. Instead callers supply:
 *   - a {@link SignerProvider} that yields a {@link Signer} for a given key id
 *     (e.g. an organisation key, or a member's key), and
 *   - a {@link Verifier} that checks signatures.
 *
 * A zero-dependency reference implementation over Node's Ed25519 lives in
 * `./node-ed25519.ts`, but any backend (libsodium, an HSM, a remote KMS, a
 * member's .HMAN KeyManager) can implement these three interfaces.
 */

import { canonicalBytes, sha256Hex } from './canonical.js';

export type Alg = 'ed25519';

/** A loaded key that can produce signatures. */
export interface Signer {
  /** Logical id of the key (org id, membership signing-key id, …). */
  readonly keyId: string;
  /** Public key, base64url-encoded raw bytes. */
  readonly publicKey: string;
  readonly alg: Alg;
  /** Sign the exact bytes; returns a base64url signature. */
  sign(message: Uint8Array): Promise<string>;
}

/** Verifies signatures produced by a {@link Signer}. */
export interface Verifier {
  verify(message: Uint8Array, signature: string, publicKey: string, alg?: Alg): Promise<boolean>;
}

/** Resolves a {@link Signer} for a key id, or `undefined` if not held locally. */
export interface SignerProvider {
  getSigner(keyId: string): Promise<Signer | undefined>;
}

/** One party's signature inside a multi-party {@link Attestation}. */
export interface SignatureEntry {
  /** Key id of the signer. */
  keyId: string;
  /** Signer's public key (base64url raw). */
  publicKey: string;
  alg: Alg;
  /** base64url signature over the canonical body bytes. */
  signature: string;
  /** Optional human label for the signer's capacity (e.g. "organisation", "member"). */
  capacity?: string;
}

/**
 * A signed statement. `hash` is the SHA-256 of the canonical body bytes that
 * every signature is computed over; `domain` namespaces the body to prevent
 * cross-protocol replay. The body itself is *not* stored here — it is
 * reconstructed from the live record at verification time and checked against
 * `hash`.
 */
export interface Attestation {
  domain: string;
  hash: string;
  signatures: SignatureEntry[];
  issued_at: string;
}

/** Sign `body` (namespaced by `domain`) with one signer, returning an entry + the signed bytes. */
export async function signEntry(
  domain: string,
  body: unknown,
  signer: Signer,
  capacity?: string
): Promise<{ entry: SignatureEntry; bytes: Uint8Array }> {
  const bytes = canonicalBytes({ domain, body });
  const signature = await signer.sign(bytes);
  const entry: SignatureEntry = {
    keyId: signer.keyId,
    publicKey: signer.publicKey,
    alg: signer.alg,
    signature,
    ...(capacity ? { capacity } : {}),
  };
  return { entry, bytes };
}

/** Assemble an {@link Attestation} from `domain`, the signed `body`, and collected signatures. */
export function assembleAttestation(
  domain: string,
  body: unknown,
  signatures: SignatureEntry[],
  issuedAt: string
): Attestation {
  return {
    domain,
    hash: sha256Hex(canonicalBytes({ domain, body })),
    signatures,
    issued_at: issuedAt,
  };
}

/** Convenience: sign `body` with one or more signers and assemble the attestation. */
export async function attest(
  domain: string,
  body: unknown,
  signers: Array<{ signer: Signer; capacity?: string }>,
  issuedAt: string
): Promise<Attestation> {
  const entries: SignatureEntry[] = [];
  for (const { signer, capacity } of signers) {
    const { entry } = await signEntry(domain, body, signer, capacity);
    entries.push(entry);
  }
  return assembleAttestation(domain, body, entries, issuedAt);
}

/**
 * Verify an attestation against the live `body`. Re-derives the canonical
 * bytes, checks the integrity hash, then verifies every signature. Returns
 * false on any mismatch. With `requiredCapacities`, also asserts that each
 * named capacity is present and valid.
 */
export async function verifyAttestation(
  domain: string,
  body: unknown,
  attestation: Attestation,
  verifier: Verifier,
  requiredCapacities?: string[]
): Promise<boolean> {
  if (attestation.domain !== domain) return false;
  const bytes = canonicalBytes({ domain, body });
  if (sha256Hex(bytes) !== attestation.hash) return false;
  if (attestation.signatures.length === 0) return false;

  for (const sig of attestation.signatures) {
    const ok = await verifier.verify(bytes, sig.signature, sig.publicKey, sig.alg);
    if (!ok) return false;
  }
  if (requiredCapacities) {
    const present = new Set(attestation.signatures.map((s) => s.capacity));
    for (const cap of requiredCapacities) {
      if (!present.has(cap)) return false;
    }
  }
  return true;
}
