// KeyManager.swift — Keychain-backed persistence for PACT signing keys.
//
// PACT keys never leave the Keychain in plaintext. The store/load/delete
// surface here is deliberately small: the iOS app is a mobile client of
// the desktop's key hierarchy — it doesn't manage vaults or master keys
// (those stay in @hman/core's KeyManager on the desktop), it just owns
// a per-entity signing key for offline / on-the-go consent attestations.
//
// Secure Enclave wrapping is intentionally out of scope (issue #15
// non-goal). When a follow-up issue picks that up the API here can stay
// the same — only the storage tier changes from Keychain-blob to
// Keychain-with-SecKey-attribute.
//
// Why two Keychain entries per identifier rather than one combined blob:
// `KeychainAccess` is string-keyed and the public key is not secret —
// keeping them separate means a UI surface that just wants to show the
// fingerprint can read the public key without unlocking the device for
// the secret key. Both still live behind the same Keychain ACL.

import Foundation
import KeychainAccess

public enum KeyManagerError: Error, Equatable, Sendable {
    /// Keychain returned data that wasn't the expected libsodium key
    /// shape (32 bytes public, 64 bytes secret).
    case malformedStoredKey
    /// Underlying KeychainAccess failure. Wrapped string for diagnostics
    /// without leaking the private key bytes through `Error` printing.
    case keychain(String)
}

/// Stores PACT keypairs in the iOS Keychain, keyed by an entity / member
/// identifier chosen by the caller. Multiple keypairs can coexist so a
/// member running several entities (Personal / Trade / etc.) can hold a
/// key per entity on the same device.
public final class KeyManager: @unchecked Sendable {
    /// Default Keychain service id, namespaced so PACT keys don't collide
    /// with bridge bearer tokens (`ai.hman.bridge` from BridgeClient).
    public static let defaultService = "ai.hman.pact"

    /// Suffix appended to the identifier for the public-key entry.
    private static let publicKeySuffix = ".pub"
    /// Suffix appended to the identifier for the private-key entry.
    private static let privateKeySuffix = ".sec"

    private let keychain: Keychain

    public init(service: String = KeyManager.defaultService) {
        self.keychain = Keychain(service: service)
            .accessibility(.afterFirstUnlockThisDeviceOnly)
            .synchronizable(false)
    }

    /// Test-only initialiser that takes a pre-built KeychainAccess instance.
    /// Lets the test target inject a service-name-only Keychain without
    /// the production accessibility / synchronisable defaults that fight
    /// the simulator on CI.
    internal init(keychain: Keychain) {
        self.keychain = keychain
    }

    /// Persist a keypair under `identifier`. Overwrites any existing entry
    /// with the same identifier — callers that need stricter semantics
    /// can wrap this in a `load(for:) == nil` check.
    public func store(keyPair: KeyPair, for identifier: String) throws {
        guard keyPair.publicKey.count == PACTSigner.publicKeyBytes,
              keyPair.privateKey.count == PACTSigner.privateKeyBytes else {
            throw KeyManagerError.malformedStoredKey
        }
        do {
            try keychain.set(keyPair.publicKey, key: identifier + Self.publicKeySuffix)
            try keychain.set(keyPair.privateKey, key: identifier + Self.privateKeySuffix)
        } catch {
            throw KeyManagerError.keychain(String(describing: error))
        }
    }

    /// Load a keypair by `identifier`. Returns nil if either half is
    /// missing — the two entries are written together so a half-present
    /// state is treated as "not stored" rather than an error.
    public func load(for identifier: String) throws -> KeyPair? {
        let pubData: Data?
        let privData: Data?
        do {
            pubData = try keychain.getData(identifier + Self.publicKeySuffix)
            privData = try keychain.getData(identifier + Self.privateKeySuffix)
        } catch {
            throw KeyManagerError.keychain(String(describing: error))
        }
        guard let pub = pubData, let priv = privData else {
            return nil
        }
        guard pub.count == PACTSigner.publicKeyBytes,
              priv.count == PACTSigner.privateKeyBytes else {
            throw KeyManagerError.malformedStoredKey
        }
        return KeyPair(publicKey: pub, privateKey: priv)
    }

    /// Delete a stored keypair. Idempotent — calling on a missing
    /// identifier is a no-op, matching the desktop `unloadEntityKey`
    /// pattern.
    public func delete(for identifier: String) throws {
        do {
            try keychain.remove(identifier + Self.publicKeySuffix)
            try keychain.remove(identifier + Self.privateKeySuffix)
        } catch {
            throw KeyManagerError.keychain(String(describing: error))
        }
    }
}
