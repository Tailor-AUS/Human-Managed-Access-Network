export { canonicalJson, canonicalBytes, sha256Hex } from './canonical.js';
export {
  signEntry,
  attest,
  assembleAttestation,
  verifyAttestation,
  type Alg,
  type Signer,
  type Verifier,
  type SignerProvider,
  type SignatureEntry,
  type Attestation,
} from './signer.js';
export {
  generateEd25519,
  Ed25519Signer,
  Ed25519Verifier,
  MemoryKeyStore,
  type Ed25519KeyPair,
} from './node-ed25519.js';
