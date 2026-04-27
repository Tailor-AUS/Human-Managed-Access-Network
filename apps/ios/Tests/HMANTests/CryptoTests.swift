// CryptoTests.swift — PACT signing primitives + cross-platform fixture.
//
// Two jobs:
//   1. Roundtrip / negative-case unit tests for PACTSigner, KeyManager,
//      and ConstantTime — covers correctness on the iOS side.
//   2. Emit Tests/HMANTests/Fixtures/ios_signature_fixture.json with a
//      (publicKey, message, signature) triple. The desktop test
//      `packages/core/src/__tests__/cross-platform.test.ts` reads this
//      file and verifies the signature with @hman/core's verifier — that's
//      the real cross-platform contract.
//
// The fixture is rewritten on every test run rather than committed, so
// the desktop test is exercising "a signature this build of the iOS code
// just produced", not a stale capture. Reviewers running `swift test &&
// npm -w @hman/core test` see a true end-to-end verification.

import XCTest
@testable import HMAN

final class CryptoTests: XCTestCase {

    // MARK: - PACTSigner roundtrip

    func testGenerateKeyPairProducesCorrectShape() throws {
        let kp = try PACTSigner.generateKeyPair()
        XCTAssertEqual(kp.publicKey.count, PACTSigner.publicKeyBytes)
        XCTAssertEqual(kp.privateKey.count, PACTSigner.privateKeyBytes)
    }

    func testGeneratedKeyPairsAreUnique() throws {
        let a = try PACTSigner.generateKeyPair()
        let b = try PACTSigner.generateKeyPair()
        XCTAssertNotEqual(a.publicKey, b.publicKey)
        XCTAssertNotEqual(a.privateKey, b.privateKey)
    }

    func testSignVerifyRoundtrip() throws {
        let kp = try PACTSigner.generateKeyPair()
        let message = Data("hello from the cafe".utf8)
        let sig = try PACTSigner.sign(message: message, privateKey: kp.privateKey)
        XCTAssertEqual(sig.count, PACTSigner.signatureBytes)
        XCTAssertTrue(PACTSigner.verify(message: message, signature: sig, publicKey: kp.publicKey))
    }

    func testVerifyRejectsTamperedMessage() throws {
        let kp = try PACTSigner.generateKeyPair()
        let sig = try PACTSigner.sign(message: Data("original".utf8), privateKey: kp.privateKey)
        XCTAssertFalse(
            PACTSigner.verify(
                message: Data("tampered".utf8),
                signature: sig,
                publicKey: kp.publicKey
            )
        )
    }

    func testVerifyRejectsWrongPublicKey() throws {
        let signer = try PACTSigner.generateKeyPair()
        let other = try PACTSigner.generateKeyPair()
        let msg = Data("payload".utf8)
        let sig = try PACTSigner.sign(message: msg, privateKey: signer.privateKey)
        XCTAssertFalse(PACTSigner.verify(message: msg, signature: sig, publicKey: other.publicKey))
    }

    func testVerifyReturnsFalseForMalformedInput() throws {
        let kp = try PACTSigner.generateKeyPair()
        let msg = Data("payload".utf8)
        // Wrong-length sig should not throw — desktop semantics demand `false`.
        XCTAssertFalse(PACTSigner.verify(message: msg, signature: Data(repeating: 0, count: 10), publicKey: kp.publicKey))
        // Wrong-length public key likewise.
        let sig = try PACTSigner.sign(message: msg, privateKey: kp.privateKey)
        XCTAssertFalse(PACTSigner.verify(message: msg, signature: sig, publicKey: Data(repeating: 0, count: 10)))
    }

    func testSignRejectsMalformedSecretKey() {
        let msg = Data("payload".utf8)
        XCTAssertThrowsError(try PACTSigner.sign(message: msg, privateKey: Data(repeating: 0, count: 16))) { error in
            guard case PACTSignerError.invalidLength = error else {
                XCTFail("Expected invalidLength, got \(error)")
                return
            }
        }
    }

    // MARK: - Argon2id key derivation

    func testDeriveKeyDeterministicForSameInputs() throws {
        let salt = PACTSigner.randomSalt()
        // Use minimal cost for unit-test runtime — interactive / 64MiB
        // is correctness-tested in the cross-platform suite where we
        // pin parameters that the desktop will replay.
        let a = try PACTSigner.deriveKey(passphrase: "hunter2", salt: salt, iterations: 2, memoryCostKiB: 8 * 1024)
        let b = try PACTSigner.deriveKey(passphrase: "hunter2", salt: salt, iterations: 2, memoryCostKiB: 8 * 1024)
        XCTAssertEqual(a, b)
        XCTAssertEqual(a.count, PACTSigner.derivedKeyBytes)
    }

    func testDeriveKeyDiffersWithDifferentSalt() throws {
        let saltA = PACTSigner.randomSalt()
        let saltB = PACTSigner.randomSalt()
        let a = try PACTSigner.deriveKey(passphrase: "hunter2", salt: saltA, iterations: 2, memoryCostKiB: 8 * 1024)
        let b = try PACTSigner.deriveKey(passphrase: "hunter2", salt: saltB, iterations: 2, memoryCostKiB: 8 * 1024)
        XCTAssertNotEqual(a, b)
    }

    func testDeriveKeyRejectsBadSaltLength() {
        XCTAssertThrowsError(
            try PACTSigner.deriveKey(passphrase: "x", salt: Data(repeating: 0, count: 5))
        )
    }

    // MARK: - Base64 (libsodium URLSAFE_NO_PADDING)

    func testBase64RoundtripsArbitraryBytes() {
        for length in [0, 1, 2, 3, 16, 31, 32, 64, 100] {
            let bytes = Data((0..<length).map { _ in UInt8.random(in: 0...255) })
            let s = PACTSigner.toBase64(bytes)
            // libsodium's URL-safe variant never emits + / =
            XCTAssertFalse(s.contains("+"))
            XCTAssertFalse(s.contains("/"))
            XCTAssertFalse(s.contains("="))
            let decoded = PACTSigner.fromBase64(s)
            XCTAssertEqual(decoded, bytes, "roundtrip failed for length \(length)")
        }
    }

    func testBase64KnownVectorMatchesLibsodium() {
        // Vector cross-checked against `sodium.to_base64(new Uint8Array([0xde,0xad,0xbe,0xef]))`
        // on libsodium-wrappers-sumo 0.7.13 (default URLSAFE_NO_PADDING variant).
        let bytes = Data([0xde, 0xad, 0xbe, 0xef])
        XCTAssertEqual(PACTSigner.toBase64(bytes), "3q2-7w")
    }

    // MARK: - ConstantTime

    func testConstantTimeEqualsTrueForIdentical() {
        let a = Data([1, 2, 3, 4, 5])
        let b = Data([1, 2, 3, 4, 5])
        XCTAssertTrue(ConstantTime.equal(a, b))
    }

    func testConstantTimeRejectsDifferentBytes() {
        let a = Data([1, 2, 3])
        let b = Data([1, 2, 4])
        XCTAssertFalse(ConstantTime.equal(a, b))
    }

    func testConstantTimeRejectsDifferentLengths() {
        let a = Data([1, 2, 3])
        let b = Data([1, 2, 3, 4])
        XCTAssertFalse(ConstantTime.equal(a, b))
    }

    func testConstantTimeHandlesEmpty() {
        XCTAssertTrue(ConstantTime.equal(Data(), Data()))
        XCTAssertFalse(ConstantTime.equal(Data(), Data([1])))
    }

    // MARK: - KeyManager

    /// Use a process-unique service name so concurrent test runs (and the
    /// shared simulator Keychain) don't collide across invocations.
    private func freshKeyManager() -> KeyManager {
        let suffix = UUID().uuidString
        return KeyManager(service: "ai.hman.pact.test.\(suffix)")
    }

    func testKeyManagerStoreLoadRoundtrip() throws {
        let km = freshKeyManager()
        let kp = try PACTSigner.generateKeyPair()
        let id = "entity-\(UUID().uuidString)"

        try km.store(keyPair: kp, for: id)
        defer { try? km.delete(for: id) }

        let loaded = try XCTUnwrap(km.load(for: id))
        XCTAssertEqual(loaded.publicKey, kp.publicKey)
        XCTAssertEqual(loaded.privateKey, kp.privateKey)
    }

    func testKeyManagerLoadReturnsNilForMissing() throws {
        let km = freshKeyManager()
        XCTAssertNil(try km.load(for: "no-such-entity"))
    }

    func testKeyManagerDeleteRemovesBothHalves() throws {
        let km = freshKeyManager()
        let kp = try PACTSigner.generateKeyPair()
        let id = "entity-\(UUID().uuidString)"
        try km.store(keyPair: kp, for: id)
        try km.delete(for: id)
        XCTAssertNil(try km.load(for: id))
    }

    func testKeyManagerDeleteIsIdempotent() {
        let km = freshKeyManager()
        XCTAssertNoThrow(try km.delete(for: "never-stored"))
    }

    // MARK: - Cross-platform fixture emission

    /// Sign a deterministic-ish payload on iOS, then write the public key,
    /// message, and signature out as JSON for the desktop verifier in
    /// `packages/core/src/__tests__/cross-platform.test.ts` to consume.
    /// The fixture is regenerated every run so signatures stay current
    /// with the active build of PACTSigner.
    func testEmitFixtureForDesktopVerification() throws {
        let kp = try PACTSigner.generateKeyPair()
        // A varied multi-byte message exercises Ed25519 over the kind of
        // canonical-JSON blob a real consent attestation would carry,
        // without depending on the entity types (which would pull in the
        // full HMAN model graph just for a fixture).
        let message = Data(#"{"actor":"member-test","intent":"approve","ts":"2026-04-26T00:00:00Z"}"#.utf8)
        let signature = try PACTSigner.sign(message: message, privateKey: kp.privateKey)

        // Sanity: verify on iOS first, so a desktop failure means the
        // wire format mismatched, not that the signature itself was bad.
        XCTAssertTrue(PACTSigner.verify(message: message, signature: signature, publicKey: kp.publicKey))

        let fixture: [String: String] = [
            "platform": "ios",
            "scheme": "ed25519-detached",
            "encoding": "libsodium-urlsafe-no-padding-base64",
            "publicKey": PACTSigner.toBase64(kp.publicKey),
            "message": PACTSigner.toBase64(message),
            "signature": PACTSigner.toBase64(signature),
        ]

        try writeFixture(fixture, named: "ios_signature_fixture.json")
    }

    // MARK: - Helpers

    /// Locate `Tests/HMANTests/Fixtures/` from inside the running test
    /// binary. SwiftPM keeps the test target's source files reachable
    /// via `#filePath`, which gives us a stable anchor regardless of the
    /// build directory layout (.build on Linux/macOS, DerivedData when
    /// running from Xcode).
    private func writeFixture<T: Encodable>(_ value: T, named filename: String) throws {
        let fixturesDir = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("Fixtures")
        try FileManager.default.createDirectory(
            at: fixturesDir,
            withIntermediateDirectories: true
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(value)
        try data.write(to: fixturesDir.appendingPathComponent(filename), options: .atomic)
    }
}
