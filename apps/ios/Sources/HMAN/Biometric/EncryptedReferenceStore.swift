// EncryptedReferenceStore.swift — Keychain-backed persistence for
// `EnrolledReference`.
//
// Per the issue acceptance criteria the reference is stored ONLY in
// Keychain — never UserDefaults / file system. KeychainAccess gives us
// AES-256 envelope encryption with the device's Secure Enclave for
// free, plus optional `whenUnlockedThisDeviceOnly` accessibility (so
// the reference can't be restored to a different device from an
// iCloud backup).
//
// Layout:
//   service: ai.hman.biometric
//   key:     "member.<memberId>.voiceReference"
//   value:   JSONEncoder.encode(EnrolledReference)  →  Keychain item
//
// The desktop's Fernet-encrypted file is the equivalent on macOS /
// Linux; on iOS we lean on Keychain because (a) it's the canonical
// secure store, (b) it's wiped on app uninstall, (c) it integrates
// with Face ID / Touch ID for future biometric-gated reads.
//
// We deliberately do NOT add a passphrase layer on top — the desktop
// flow uses one because the file lives on disk. Keychain already
// requires the device to be unlocked, which is a stronger guarantee.

import Foundation
import KeychainAccess

public enum ReferenceStoreError: Error, Sendable, Equatable {
    /// Keychain returned an error on read/write/delete. The string is
    /// the underlying `OSStatus`-derived message — surface to the user
    /// only via a generic "could not access secure storage" copy.
    case keychain(String)
    /// Stored payload couldn't be decoded (schema drift or corruption).
    /// Caller should fall through to re-enrolment rather than retrying.
    case decodingFailed(String)
    /// Tried to encode a reference that contains non-finite floats.
    case encodingFailed(String)
}

public protocol ReferenceStore: Sendable {
    func save(_ reference: EnrolledReference) throws
    func load(memberId: String) throws -> EnrolledReference?
    func delete(memberId: String) throws
    func hasReference(memberId: String) -> Bool
}

/// Default implementation. The `service` namespace is separate from the
/// bridge token store (`ai.hman.bridge`) so a Keychain reset of one
/// doesn't drag the other along.
public struct EncryptedReferenceStore: ReferenceStore {
    public static let defaultService = "ai.hman.biometric"

    private let keychain: Keychain

    public init(service: String = EncryptedReferenceStore.defaultService) {
        // `whenUnlockedThisDeviceOnly` matches our threat model:
        //   - reference can only be read while the device is unlocked
        //   - reference cannot be migrated to a new device via backup
        //
        // The second property is what enforces "no cross-device
        // biometric sync" from the issue's non-goals — even if iCloud
        // Keychain were enabled at the OS level, the item is excluded.
        self.keychain = Keychain(service: service)
            .accessibility(.whenUnlockedThisDeviceOnly)
            .synchronizable(false)
    }

    public func save(_ reference: EnrolledReference) throws {
        // Sanity: refuse to persist a reference with non-finite floats.
        // Catching this here saves us from a confused decode at verify
        // time when the embedding round-trips through JSON.
        if reference.embedding.contains(where: { !$0.isFinite }) {
            throw ReferenceStoreError.encodingFailed("embedding contains non-finite values")
        }
        let data: Data
        do {
            data = try Self.encoder.encode(reference)
        } catch {
            throw ReferenceStoreError.encodingFailed(String(describing: error))
        }
        do {
            try keychain.set(data, key: Self.key(for: reference.memberId))
        } catch {
            throw ReferenceStoreError.keychain(String(describing: error))
        }
    }

    public func load(memberId: String) throws -> EnrolledReference? {
        let data: Data?
        do {
            data = try keychain.getData(Self.key(for: memberId))
        } catch {
            throw ReferenceStoreError.keychain(String(describing: error))
        }
        guard let data else { return nil }
        do {
            return try Self.decoder.decode(EnrolledReference.self, from: data)
        } catch {
            throw ReferenceStoreError.decodingFailed(String(describing: error))
        }
    }

    public func delete(memberId: String) throws {
        do {
            try keychain.remove(Self.key(for: memberId))
        } catch {
            throw ReferenceStoreError.keychain(String(describing: error))
        }
    }

    public func hasReference(memberId: String) -> Bool {
        // KeychainAccess doesn't expose a cheap "exists" so probe via
        // get; presence == non-nil. Failures are treated as absence so
        // the UI can drive the user to re-enrol instead of crashing.
        (try? keychain.getData(Self.key(for: memberId))) != nil
    }

    /// Keychain key shape: `member.<memberId>.voiceReference`. Matches
    /// the issue spec so an external audit can find the entry by
    /// inspection.
    public static func key(for memberId: String) -> String {
        "member.\(memberId).voiceReference"
    }

    // ── Coders ─────────────────────────────────────────────────────
    //
    // ISO-8601 dates so the stored shape matches what the bridge
    // returns on its enrolment endpoints. Embedding is encoded as a
    // plain `[Float]` JSON array — round-trip is lossless because
    // JSONEncoder writes Float as a decimal literal that Float can
    // re-parse without snapping to a different binary value (the
    // representation has > 7 significant digits which covers Float's
    // ~7 digit precision).

    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}

/// In-memory implementation for tests and previews. Keeps Keychain
/// state untouched.
public final class InMemoryReferenceStore: ReferenceStore, @unchecked Sendable {
    private var storage: [String: EnrolledReference] = [:]
    private let lock = UnfairLock()

    public init() {}

    public func save(_ reference: EnrolledReference) throws {
        lock.withLock { storage[reference.memberId] = reference }
    }

    public func load(memberId: String) throws -> EnrolledReference? {
        lock.withLock { storage[memberId] }
    }

    public func delete(memberId: String) throws {
        _ = lock.withLock { storage.removeValue(forKey: memberId) }
    }

    public func hasReference(memberId: String) -> Bool {
        lock.withLock { storage[memberId] != nil }
    }
}
