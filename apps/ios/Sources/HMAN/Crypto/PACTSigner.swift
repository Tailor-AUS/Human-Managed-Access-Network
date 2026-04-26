// PACTSigner.swift — Swift port of @hman/core's PACT signing primitives.
//
// The desktop implementation lives at packages/core/src/crypto/encryption.ts
// and packages/core/src/entity/entity-keys.ts. Both use libsodium under the
// hood (libsodium-wrappers-sumo on Node, swift-sodium here). This file is
// the iOS-side mirror — every byte produced here must verify on the
// desktop, and vice versa. See Tests/HMANTests/CryptoTests.swift for the
// fixture-emitting roundtrip and packages/core/src/__tests__/cross-platform.test.ts
// for the Node-side verifier that consumes it.
//
// Algorithm choices mirror the desktop exactly:
//   * Signing  — Ed25519 detached  (libsodium crypto_sign_*)
//   * Hashing  — BLAKE2b-256       (libsodium crypto_generichash)
//   * KDF      — Argon2id          (libsodium crypto_pwhash, ALG_ARGON2ID13)
//   * Base64   — URL-safe, no pad  (libsodium variant 7, default of to_base64)
//
// Note on the issue text: #15 mentions "PBKDF2-SHA256 600k" as the desktop
// KDF, but the actual desktop code uses Argon2id (interactive limits, 64
// MiB / 3 iter by default). We match the *code*, not the issue prose, so
// keys derived in either direction are byte-identical. If the team later
// wants PBKDF2 as an interop alternative, that's a follow-up that needs to
// land on the desktop side first.

import Foundation
import Sodium
import Clibsodium

/// An Ed25519 keypair. Both fields hold raw libsodium-shaped bytes:
///   * `publicKey`  — 32 bytes
///   * `privateKey` — 64 bytes (libsodium's "secret key" includes the seed
///                    and a copy of the public key, hence 64 not 32)
public struct KeyPair: Equatable, Sendable {
    public let publicKey: Data
    public let privateKey: Data

    public init(publicKey: Data, privateKey: Data) {
        self.publicKey = publicKey
        self.privateKey = privateKey
    }
}

/// Errors thrown by the PACT signing primitives. Verification deliberately
/// returns `Bool` instead of throwing — matching `verifyDetachedEd25519`
/// in `entity-keys.ts`, which never throws.
public enum PACTSignerError: Error, Equatable, Sendable {
    /// libsodium failed to initialise. Should be impossible on a healthy
    /// platform; surfaced so callers can decide whether to retry or fail
    /// the whole onboarding flow.
    case sodiumInitFailed
    /// Key generation returned an unexpected shape.
    case keyGenerationFailed
    /// The signing primitive failed (typically a malformed secret key).
    case signFailed
    /// Argon2id parameters were invalid for this build of libsodium.
    case keyDerivationFailed
    /// A `Data` parameter had the wrong length for the algorithm.
    case invalidLength(expected: Int, actual: Int)
}

/// Configuration for `deriveKey`. Defaults mirror desktop's
/// `DEFAULT_KEY_DERIVATION_CONFIG` (interactive Argon2id: 64 MiB, 3 iter).
public struct KeyDerivationConfig: Equatable, Sendable {
    /// Memory cost in KiB. Multiplied by 1024 before passing to libsodium.
    public let memoryCostKiB: Int
    /// Iteration count (libsodium's "opslimit").
    public let timeCost: Int

    public init(memoryCostKiB: Int = 65_536, timeCost: Int = 3) {
        self.memoryCostKiB = memoryCostKiB
        self.timeCost = timeCost
    }

    public static let `default` = KeyDerivationConfig()
}

/// Static facade for the iOS-side PACT primitives. Stateless by design —
/// no key material is retained after a call returns. Persistence lives
/// in `KeyManager` (Keychain-backed).
public enum PACTSigner {
    /// Salt length expected by `deriveKey`. Mirrors libsodium's
    /// `crypto_pwhash_SALTBYTES` (16). Exposed so callers can mint salts
    /// without depending on Sodium directly.
    public static let saltBytes = 16

    /// Output key length for `deriveKey`. Matches libsodium's
    /// `crypto_secretbox_KEYBYTES` (32) — the desktop derives a symmetric
    /// XChaCha20-Poly1305 key, not a signing key.
    public static let derivedKeyBytes = 32

    /// Public-key length for Ed25519. 32 bytes.
    public static let publicKeyBytes = 32

    /// Secret-key length for Ed25519 in libsodium's representation.
    /// 64 bytes (seed + public key concatenated).
    public static let privateKeyBytes = 64

    /// Detached signature length for Ed25519. 64 bytes.
    public static let signatureBytes = 64

    /// Generate a fresh Ed25519 signing keypair.
    ///
    /// The returned `privateKey` includes the seed and public key in
    /// libsodium's 64-byte layout — pass it through to `sign(message:privateKey:)`
    /// and `KeyManager.store(...)` without slicing.
    public static func generateKeyPair() throws -> KeyPair {
        let sodium = Sodium()
        guard let kp = sodium.sign.keyPair() else {
            throw PACTSignerError.keyGenerationFailed
        }
        guard kp.publicKey.count == publicKeyBytes,
              kp.secretKey.count == privateKeyBytes else {
            throw PACTSignerError.keyGenerationFailed
        }
        return KeyPair(
            publicKey: Data(kp.publicKey),
            privateKey: Data(kp.secretKey)
        )
    }

    /// Detached Ed25519 signature over `message`. Returns 64 raw bytes
    /// (encode to base64 only at storage / wire boundaries — keeps the
    /// inner API byte-pure and matches desktop's `signDetachedEd25519`
    /// before its `toBase64` step).
    public static func sign(message: Data, privateKey: Data) throws -> Data {
        guard privateKey.count == privateKeyBytes else {
            throw PACTSignerError.invalidLength(expected: privateKeyBytes, actual: privateKey.count)
        }
        let sodium = Sodium()
        let messageBytes = [UInt8](message)
        let secretBytes = [UInt8](privateKey)
        guard let sig = sodium.sign.signature(message: messageBytes, secretKey: secretBytes) else {
            throw PACTSignerError.signFailed
        }
        return Data(sig)
    }

    /// Verify a detached Ed25519 signature. Never throws — returns false
    /// on length mismatches or libsodium rejection. This mirrors the
    /// desktop's `verifyDetachedEd25519` contract precisely.
    public static func verify(message: Data, signature: Data, publicKey: Data) -> Bool {
        guard signature.count == signatureBytes,
              publicKey.count == publicKeyBytes else {
            return false
        }
        let sodium = Sodium()
        return sodium.sign.verify(
            message: [UInt8](message),
            publicKey: [UInt8](publicKey),
            signature: [UInt8](signature)
        )
    }

    /// Derive a 32-byte symmetric key from a passphrase and salt using
    /// Argon2id. Matches `deriveKeyFromPassphrase` in the desktop's
    /// `encryption.ts`. Salt must be `saltBytes` long; mint one with
    /// `randomSalt()` for new derivations and reuse on subsequent
    /// unlocks.
    ///
    /// `iterations` maps to libsodium's `opslimit`. The desktop default
    /// is 3 (interactive) — pass that for compatibility with desktop-
    /// minted vault state. The legacy `iterations` parameter name is
    /// retained for API compatibility with the issue spec.
    public static func deriveKey(
        passphrase: String,
        salt: Data,
        iterations: Int = 3,
        memoryCostKiB: Int = KeyDerivationConfig.default.memoryCostKiB
    ) throws -> Data {
        guard salt.count == saltBytes else {
            throw PACTSignerError.invalidLength(expected: saltBytes, actual: salt.count)
        }
        let sodium = Sodium()
        guard let key = sodium.pwHash.hash(
            outputLength: derivedKeyBytes,
            passwd: [UInt8](passphrase.utf8),
            salt: [UInt8](salt),
            opsLimit: iterations,
            memLimit: memoryCostKiB * 1024,
            alg: .Argon2ID13
        ) else {
            throw PACTSignerError.keyDerivationFailed
        }
        return Data(key)
    }

    /// Convenience: mint a fresh `saltBytes`-byte random salt for use with
    /// `deriveKey`. Backed by libsodium's `randombytes_buf`, identical to
    /// the desktop's salt-minting path.
    public static func randomSalt() -> Data {
        let sodium = Sodium()
        return Data(sodium.randomBytes.buf(length: saltBytes) ?? [])
    }

    /// URL-safe, unpadded base64 encoding of `data`. Matches libsodium's
    /// default `to_base64` variant (variant 7, URLSAFE_NO_PADDING) used
    /// by every base64-emitting function in the desktop crypto module.
    /// Exposed so test fixtures and wire payloads encode identically on
    /// both platforms.
    public static func toBase64(_ data: Data) -> String {
        var s = data.base64EncodedString()
        s = s.replacingOccurrences(of: "+", with: "-")
        s = s.replacingOccurrences(of: "/", with: "_")
        // Strip padding to match libsodium's URLSAFE_NO_PADDING variant.
        while s.hasSuffix("=") { s.removeLast() }
        return s
    }

    /// Decode a libsodium-flavour URL-safe base64 string. Tolerates both
    /// padded and unpadded inputs — the desktop never emits padding, but
    /// being lenient on input keeps callers ergonomic.
    public static func fromBase64(_ string: String) -> Data? {
        var s = string
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        // Re-pad to a multiple of 4 — Foundation's Base64 decoder requires it.
        let remainder = s.count % 4
        if remainder == 2 { s.append("==") }
        else if remainder == 3 { s.append("=") }
        else if remainder == 1 { return nil }
        return Data(base64Encoded: s)
    }
}
