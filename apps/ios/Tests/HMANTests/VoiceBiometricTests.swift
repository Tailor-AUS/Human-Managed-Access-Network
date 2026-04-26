// VoiceBiometricTests.swift — pipeline tests for the Gate 5 voice
// biometric module.
//
// We use a deterministic stub encoder (`StubVoiceEncoder`) that maps a
// PCM blob to a known embedding via a tagged-byte protocol: each input
// `Data` carries a 1-byte "speaker id" prefix; the stub returns a
// L2-normalised one-hot vector flipped on that id, plus a small
// per-sample noise component drawn from the sample bytes so different
// utterances from the same speaker don't all collapse to the same
// vector. This lets us exercise:
//
//   - same-speaker enrolment + verify  → high cosine, accept
//   - cross-speaker verify              → low cosine, reject
//   - threshold tunability              → flip the verdict by moving
//                                         the threshold across the
//                                         observed similarity
//   - persistence round-trip            → save / load via the
//                                         in-memory store
//
// The stub deliberately produces high but not perfect intra-speaker
// similarity (~0.95) and low cross-speaker similarity (~0.0) so we
// have headroom for the threshold tests.

import XCTest
@testable import HMAN

final class VoiceBiometricTests: XCTestCase {

    // ── Test helpers ───────────────────────────────────────────────

    /// Synthetic PCM with a tagged speaker id and a deterministic
    /// per-sample salt. Audited as a 3-second 16 kHz mono utterance.
    private func makeUtterance(speakerId: UInt8, salt: UInt8) -> Data {
        let frames = 3 * VoiceAuditThresholds.sampleRate  // 3s @ 16 kHz
        var floats = [Float](repeating: 0, count: frames)
        // Steady-ish 200 Hz sine at amplitude 0.2 → RMS ~0.14 (well
        // inside the audit band [0.01, 0.40]). The salt is mixed in as
        // a low-amplitude phase shift so the audit reads it as natural
        // variation rather than a clipped signal.
        let amplitude: Float = 0.2
        for i in 0..<frames {
            let t = Float(i) / Float(VoiceAuditThresholds.sampleRate)
            let phase = 2 * Float.pi * 200 * t + Float(salt) * 0.01
            floats[i] = amplitude * sin(phase)
        }
        // Pack as 32-bit LE floats.
        var data = floats.withUnsafeBufferPointer { Data(buffer: $0) }
        // Prefix the speaker id so the stub encoder can recover it.
        // We pad with 3 zero bytes so the float-grid alignment of the
        // remaining audio stays stable; the audit reads the whole
        // buffer as floats and ignores the stray prefix at <100µs of
        // signal.
        data.insert(contentsOf: [speakerId, 0, 0, 0], at: 0)
        return data
    }

    private func resetEncoder() {
        VoiceBiometric.encoder = StubVoiceEncoder()
        VoiceBiometric.threshold = 0.75
    }

    override func setUp() {
        super.setUp()
        resetEncoder()
    }

    override func tearDown() {
        VoiceBiometric.threshold = 0.75
        super.tearDown()
    }

    // ── Audit ──────────────────────────────────────────────────────

    func testAuditAcceptsRealisticSample() {
        let pcm = makeUtterance(speakerId: 1, salt: 0)
        let audit = VoiceBiometric.audit(pcm: pcm)
        XCTAssertTrue(audit.ok, "expected audit to accept; got: \(audit.reason)")
        XCTAssertGreaterThan(audit.durationSeconds, 2.5)
        XCTAssertLessThan(audit.durationSeconds, 3.5)
    }

    func testAuditRejectsTooShort() {
        let frames = 1 * VoiceAuditThresholds.sampleRate  // 1s
        let floats = [Float](repeating: 0.1, count: frames)
        let pcm = floats.withUnsafeBufferPointer { Data(buffer: $0) }
        let audit = VoiceBiometric.audit(pcm: pcm)
        XCTAssertFalse(audit.ok)
        XCTAssertTrue(audit.reason.contains("too short"))
    }

    func testAuditRejectsSilence() {
        let frames = 3 * VoiceAuditThresholds.sampleRate
        let floats = [Float](repeating: 0, count: frames)
        let pcm = floats.withUnsafeBufferPointer { Data(buffer: $0) }
        let audit = VoiceBiometric.audit(pcm: pcm)
        XCTAssertFalse(audit.ok)
        XCTAssertTrue(audit.reason.contains("too quiet"))
    }

    // ── Roundtrip: enrol same speaker, verify accepts ──────────────

    func testEnrolThenVerifySameSpeakerAccepts() async throws {
        let samples = (0..<10).map { makeUtterance(speakerId: 7, salt: UInt8($0)) }
        let reference = try await VoiceBiometric.enrollFromUtterances(
            samples: samples,
            memberId: "test-member"
        )
        XCTAssertEqual(reference.memberId, "test-member")
        XCTAssertEqual(reference.embedding.count, 256)
        XCTAssertEqual(reference.model, "stub-test")
        XCTAssertGreaterThanOrEqual(reference.samplesUsed, VoiceBiometric.minSamples)

        // Same speaker, fresh utterance, different salt → should accept.
        let probe = makeUtterance(speakerId: 7, salt: 99)
        let (sim, accept) = try await VoiceBiometric.verify(utterance: probe, reference: reference)
        XCTAssertGreaterThan(sim, 0.9, "intra-speaker cosine should be > 0.9 with the stub encoder")
        XCTAssertTrue(accept, "intra-speaker should accept at default threshold 0.75")
    }

    // ── Cross-speaker rejection ────────────────────────────────────

    func testVerifyDifferentSpeakerRejects() async throws {
        let samples = (0..<10).map { makeUtterance(speakerId: 7, salt: UInt8($0)) }
        let reference = try await VoiceBiometric.enrollFromUtterances(
            samples: samples,
            memberId: "test-member"
        )
        // Different speaker id → orthogonal one-hot → cosine ≈ 0.
        let imposter = makeUtterance(speakerId: 42, salt: 0)
        let (sim, accept) = try await VoiceBiometric.verify(utterance: imposter, reference: reference)
        XCTAssertLessThan(sim, 0.5, "cross-speaker cosine should be well below threshold")
        XCTAssertFalse(accept, "cross-speaker should reject at default threshold")
    }

    // ── Threshold tunability ───────────────────────────────────────

    func testThresholdTunabilityFlipsVerdict() async throws {
        let samples = (0..<10).map { makeUtterance(speakerId: 3, salt: UInt8($0)) }
        let reference = try await VoiceBiometric.enrollFromUtterances(
            samples: samples,
            memberId: "test-member"
        )
        let probe = makeUtterance(speakerId: 3, salt: 200)
        let (sim, _) = try await VoiceBiometric.verify(utterance: probe, reference: reference)
        // Threshold below sim → accept.
        VoiceBiometric.threshold = max(0.0, sim - 0.05)
        let lower = try await VoiceBiometric.verify(utterance: probe, reference: reference)
        XCTAssertTrue(lower.accept)
        // Threshold above sim → reject.
        VoiceBiometric.threshold = min(1.0, sim + 0.05)
        let upper = try await VoiceBiometric.verify(utterance: probe, reference: reference)
        XCTAssertFalse(upper.accept)
    }

    // ── Not-enough-samples guard ───────────────────────────────────

    func testEnrolFailsWithFewerThanMinSamples() async {
        let samples = [makeUtterance(speakerId: 1, salt: 0)]
        do {
            _ = try await VoiceBiometric.enrollFromUtterances(samples: samples, memberId: "x")
            XCTFail("expected notEnoughSamples to throw")
        } catch let err as VoiceBiometricError {
            if case .notEnoughSamples(let have, let need) = err {
                XCTAssertEqual(have, 1)
                XCTAssertEqual(need, VoiceBiometric.minSamples)
            } else {
                XCTFail("wrong error: \(err)")
            }
        } catch {
            XCTFail("unexpected error: \(error)")
        }
    }

    // ── Persistence round-trip via InMemoryReferenceStore ──────────

    func testReferenceStoreRoundtrip() async throws {
        let samples = (0..<10).map { makeUtterance(speakerId: 5, salt: UInt8($0)) }
        let reference = try await VoiceBiometric.enrollFromUtterances(
            samples: samples,
            memberId: "knox-hart"
        )
        let store = InMemoryReferenceStore()
        XCTAssertFalse(store.hasReference(memberId: "knox-hart"))
        try store.save(reference)
        XCTAssertTrue(store.hasReference(memberId: "knox-hart"))

        let loaded = try store.load(memberId: "knox-hart")
        XCTAssertNotNil(loaded)
        XCTAssertEqual(loaded?.memberId, "knox-hart")
        XCTAssertEqual(loaded?.embedding, reference.embedding)
        XCTAssertEqual(loaded?.samplesUsed, reference.samplesUsed)

        try store.delete(memberId: "knox-hart")
        XCTAssertFalse(store.hasReference(memberId: "knox-hart"))
    }

    // ── EncryptedReferenceStore key shape ──────────────────────────

    func testEncryptedReferenceStoreKeyShape() {
        XCTAssertEqual(
            EncryptedReferenceStore.key(for: "knox-hart"),
            "member.knox-hart.voiceReference"
        )
    }

    func testEncryptedReferenceStoreRefusesNonFiniteEmbedding() {
        let bad = EnrolledReference(
            embedding: [0.5, .nan, 0.1] + [Float](repeating: 0, count: 253),
            memberId: "x",
            samplesUsed: 3
        )
        let store = EncryptedReferenceStore(service: "ai.hman.biometric.test-nonfinite")
        do {
            try store.save(bad)
            XCTFail("expected encodingFailed for non-finite embedding")
        } catch let err as ReferenceStoreError {
            if case .encodingFailed = err { /* ok */ } else {
                XCTFail("wrong error: \(err)")
            }
        } catch {
            XCTFail("unexpected error: \(error)")
        }
    }

    // ── Cosine math sanity ─────────────────────────────────────────

    func testCosineIsOneForIdenticalVectors() {
        let v: [Float] = [1, 2, 3, 4, 5]
        XCTAssertEqual(cosine(v, v), 1.0, accuracy: 1e-5)
    }

    func testCosineIsZeroForOrthogonalVectors() {
        XCTAssertEqual(cosine([1, 0, 0], [0, 1, 0]), 0.0, accuracy: 1e-5)
    }

    func testL2NormaliseProducesUnitVector() {
        let v: [Float] = [3, 4, 0]  // ||v|| = 5
        let u = l2normalise(v)
        XCTAssertEqual(u[0], 0.6, accuracy: 1e-5)
        XCTAssertEqual(u[1], 0.8, accuracy: 1e-5)
        XCTAssertEqual(u[2], 0.0, accuracy: 1e-5)
    }

    // ── EnrollmentFlow stage progression ───────────────────────────

    @MainActor
    func testEnrollmentFlowAdvancesAndPersists() async throws {
        let store = InMemoryReferenceStore()
        let prompts = Array(kEnrollmentPrompts.prefix(5))
        let flow = EnrollmentFlow(memberId: "flow-test", prompts: prompts, store: store)
        XCTAssertEqual(flow.collectedCount, 0)
        if case let .recording(idx, _) = flow.stage {
            XCTAssertEqual(idx, 0)
        } else {
            XCTFail("expected initial stage to be .recording")
        }
        for i in 0..<prompts.count {
            let pcm = makeUtterance(speakerId: 9, salt: UInt8(i))
            try await flow.submitSample(pcm)
        }
        if case let .complete(memberId, samplesUsed) = flow.stage {
            XCTAssertEqual(memberId, "flow-test")
            XCTAssertGreaterThanOrEqual(samplesUsed, VoiceBiometric.minSamples)
        } else {
            XCTFail("expected .complete after submitting all samples; got \(flow.stage)")
        }
        XCTAssertTrue(store.hasReference(memberId: "flow-test"))
    }

    @MainActor
    func testEnrollmentFlowRejectsSilentSample() async throws {
        let flow = EnrollmentFlow(
            memberId: "silent",
            prompts: Array(kEnrollmentPrompts.prefix(3)),
            store: InMemoryReferenceStore()
        )
        let frames = 3 * VoiceAuditThresholds.sampleRate
        let silence = [Float](repeating: 0, count: frames).withUnsafeBufferPointer { Data(buffer: $0) }
        do {
            _ = try await flow.submitSample(silence)
            XCTFail("expected sampleRejected for silence")
        } catch let err as EnrollmentFlowError {
            if case .sampleRejected = err { /* ok */ } else {
                XCTFail("wrong error: \(err)")
            }
        }
        // Stage should not have advanced.
        if case let .recording(idx, _) = flow.stage {
            XCTAssertEqual(idx, 0)
        } else {
            XCTFail("flow advanced past rejected sample")
        }
    }
}

// ── StubVoiceEncoder ───────────────────────────────────────────────
//
// Deterministic encoder for tests. Inspects the first byte of `pcm` to
// pick a "speaker id"; produces a 256-dim vector that's a one-hot at
// that id index, plus a tiny per-sample salt drawn from byte[1]. The
// noise component pulls the vector slightly off-axis so different
// salts from the same speaker don't all map to the same point — this
// lets us exercise the outlier filter and gives the cosine math
// realistic numbers (intra-speaker ~0.95, cross-speaker ~0.0).

private final class StubVoiceEncoder: VoiceEncoder, @unchecked Sendable {
    let embeddingDim: Int = 256
    let modelId: String = "stub-test"

    func embed(pcm: Data) async throws -> [Float] {
        // Pick the speaker id byte. We mod by the embedding dim so any
        // accidental large value still indexes into the vector.
        let speaker = pcm.count > 0 ? Int(pcm[0]) % embeddingDim : 0
        let salt = pcm.count > 1 ? Int(pcm[1]) : 0
        var v = [Float](repeating: 0, count: embeddingDim)
        v[speaker] = 1.0
        // Tiny salt-dependent noise on the next slot (wrap-around) so
        // intra-speaker similarity is high but not 1.0. Magnitude
        // 0.05 → cosine ~0.95 between two same-speaker samples with
        // different salts.
        let noiseSlot = (speaker + 1) % embeddingDim
        v[noiseSlot] = Float(salt % 17) * 0.005
        return l2normalise(v)
    }
}
