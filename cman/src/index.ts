/**
 * @tailor/cman — CMAN, the Corporate Managed Access Network.
 *
 * Corporate structures, company constitutions and consensus governance for
 * autonomous organisations — a signer-agnostic, zero-runtime-dependency
 * TypeScript implementation of PACT for organisations any agent (including an
 * HMAN) can join. HMANs federate into a CMAN.
 *
 * Entry points:
 *   - {@link Collective} — the manager (incorporate, join, shares, governance, resolutions).
 *   - {@link buildConstitution} — ready-made constitutions per legal form.
 *   - crypto ports ({@link Signer}, {@link Verifier}, {@link SignerProvider}) +
 *     a zero-dependency Ed25519 reference backend ({@link MemoryKeyStore}).
 */

// Crypto layer (ports + reference Ed25519 backend)
export * from './crypto/index.js';

// Type model (legal forms, constitution, capital, governance, membership, resolutions)
export * from './types/index.js';

// Consensus arithmetic
export * from './consensus/index.js';

// Constitution templates
export * from './constitution/index.js';

// Manager + storage
export * from './manager/index.js';
