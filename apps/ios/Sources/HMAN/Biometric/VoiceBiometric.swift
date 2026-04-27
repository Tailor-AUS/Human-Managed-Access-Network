// VoiceBiometric.swift — on-device voice identity (Gate 5).
//
// Mirrors the desktop's `packages/python-bridge/core.py` Resemblyzer flow:
//
//   enrolment:
//     - record N utterances (canonical 10-prompt phonetic sequence)
//     - run each through the speaker encoder → 256-dim embedding
//     - mean across samples, L2-normalise → reference vector
//     - drop outliers below cosine 0.80 vs. the running mean and re-average
//     - persist (encrypted) for later verify
//
//   verify:
//     - encode the candidate utterance → embedding
//     - cosine similarity vs. the stored reference
//     - accept iff sim ≥ threshold (default 0.75; tunable)
//
// The actual neural net runs through `VoiceEncoder` — a protocol whose default
// CoreML-backed implementation lives in `CoreMLVoiceEncoder`. Tests inject
// a deterministic stub so we can exercise the pipeline without shipping
// a model.
//
// What this file does NOT do:
//   - record audio (caller passes in 16 kHz mono PCM `Data`)
//   - storage (see `EncryptedReferenceStore`)
//   - prompts / UX (see `EnrollmentFlow`)

import Foundation
import os.lock

// ── Public surface ──────────────────────────────────────────────────

/// A persisted voice identity. The embedding is L2-normalised so cosine
/// similarity reduces to a dot product at verify time.
public struct EnrolledReference: Codable, Sendable, Equatable {
    /// Speaker embedding. Resemblyzer's pretrained encoder is 256-dim.
    /// Stored normalised (`||embedding|| == 1`) so verify is a dot product.
    public let embedding: [Float]

    /// Per-device member identifier. Keys the Keychain entry.
    public let memberId: String

    /// When the reference was enrolled. Surfaced in audit logs.
    public let createdAt: Date

    /// Number of utterances that survived outlier filtering and went into
    /// the mean. Useful to spot-check enrolment quality post hoc.
    public let samplesUsed: Int

    /// Encoder identifier (e.g. `"resemblyzer"`) — pinned so we can
    /// invalidate references if we swap the model.
    public let model: String

    public init(
        embedding: [Float],
        memberId: String,
        createdAt: Date = Date(),
        samplesUsed: Int,
        model: String = "resemblyzer"
    ) {
        self.embedding = embedding
        self.memberId = memberId
        self.createdAt = createdAt
        self.samplesUsed = samplesUsed
        self.model = model
    }
}

public enum VoiceBiometricError: Error, Sendable, Equatable {
    /// Fewer than `minSamples` utterances passed audit. Caller should
    /// re-prompt rather than persisting a bad reference.
    case notEnoughSamples(have: Int, need: Int)
    /// Audio was rejected by the front-end audit (silence, clipping, too
    /// short, too long). `reason` is human-readable for the UI.
    case audioRejected(reason: String)
    /// Encoder failed to produce an embedding for one of the samples.
    case encoderFailed(String)
    /// Embedding dimension didn't match what the encoder advertised.
    case dimensionMismatch(expected: Int, actual: Int)
}

// ── Audio audit thresholds ──────────────────────────────────────────
//
// Same numbers as `packages/python-bridge/core.py`. If we tune these on
// the desktop, mirror the change here so behaviour stays consistent
// across the two enrolment paths.

public enum VoiceAuditThresholds {
    /// Sample rate the encoder expects. All audio must be 16 kHz mono
    /// float32 PCM, packed little-endian.
    public static let sampleRate: Int = 16_000
    public static let minDurationSeconds: Float = 2.0
    public static let maxDurationSeconds: Float = 12.0
    public static let minRMS: Float = 0.01
    public static let maxRMS: Float = 0.40
    public static let peakClip: Float = 0.98
}

public struct VoiceSampleAudit: Sendable, Equatable {
    public let ok: Bool
    public let reason: String
    public let durationSeconds: Float
    public let rms: Float
    public let peak: Float
}

// ── VoiceEncoder protocol ───────────────────────────────────────────

/// Computes a fixed-dim speaker embedding from a single utterance.
///
/// The shipping implementation is `CoreMLVoiceEncoder` (lazy-loaded
/// `Resemblyzer.mlmodelc` from the bundle). Tests inject a deterministic
/// stub via `VoiceBiometric.encoder = …` so the pipeline can be exercised
/// without a real model.
public protocol VoiceEncoder: Sendable {
    /// Output embedding dimension. Resemblyzer = 256.
    var embeddingDim: Int { get }
    /// Encoder identifier persisted on the reference (`"resemblyzer"` etc.).
    var modelId: String { get }
    /// Embed a single utterance. `pcm` is 16 kHz mono float32 little-endian.
    /// Implementations should L2-normalise the output.
    func embed(pcm: Data) async throws -> [Float]
}

// ── VoiceBiometric facade ───────────────────────────────────────────

public enum VoiceBiometric {
    /// Acceptance threshold for cosine similarity at verify time.
    /// 0.75 is a conservative starting point; tighten as we collect
    /// real attempt-data per member. Stored in `_threshold` (atomic via
    /// the lock) so tests can rebind without racing.
    public static var threshold: Float {
        get { _lock.withLock { _threshold } }
        set { _lock.withLock { _threshold = newValue } }
    }
    private static var _threshold: Float = 0.75

    /// Encoder used by `enrollFromUtterances` / `verify`. Tests override
    /// this with a deterministic stub. Defaults to `CoreMLVoiceEncoder`
    /// which lazy-loads the bundled `Resemblyzer.mlmodelc` if present —
    /// see that file for the manual conversion step.
    public static var encoder: VoiceEncoder {
        get { _lock.withLock { _encoder ?? CoreMLVoiceEncoder.shared } }
        set { _lock.withLock { _encoder = newValue } }
    }
    private static var _encoder: VoiceEncoder?

    /// Outlier cutoff used during enrolment. Samples whose cosine
    /// similarity to the running mean falls below this are dropped
    /// before the final reference is computed. Matches the desktop's
    /// 0.80 cutoff in `enroll_voice.py`.
    public static let enrolmentOutlierCutoff: Float = 0.80

    /// Minimum surviving samples required to persist a reference.
    /// Below this the desktop CLI also aborts.
    public static let minSamples: Int = 3

    private static let _lock = UnfairLock()

    // ── Audit ──────────────────────────────────────────────────────

    /// Pre-flight check before encoding. Same checks the desktop runs.
    /// Caller should reject on `!ok` and prompt the user to retry.
    public static func audit(pcm: Data) -> VoiceSampleAudit {
        let samples = pcm.toFloatArray()
        guard !samples.isEmpty else {
            return VoiceSampleAudit(ok: false, reason: "empty audio", durationSeconds: 0, rms: 0, peak: 0)
        }
        let duration = Float(samples.count) / Float(VoiceAuditThresholds.sampleRate)
        let rms = computeRMS(samples)
        let peak = samples.map(abs).max() ?? 0
        if duration < VoiceAuditThresholds.minDurationSeconds {
            return VoiceSampleAudit(ok: false, reason: "too short (\(String(format: "%.1f", duration))s < \(VoiceAuditThresholds.minDurationSeconds)s)", durationSeconds: duration, rms: rms, peak: peak)
        }
        if duration > VoiceAuditThresholds.maxDurationSeconds {
            return VoiceSampleAudit(ok: false, reason: "too long (\(String(format: "%.1f", duration))s > \(VoiceAuditThresholds.maxDurationSeconds)s)", durationSeconds: duration, rms: rms, peak: peak)
        }
        if rms < VoiceAuditThresholds.minRMS {
            return VoiceSampleAudit(ok: false, reason: "too quiet (RMS \(String(format: "%.4f", rms)))", durationSeconds: duration, rms: rms, peak: peak)
        }
        if rms > VoiceAuditThresholds.maxRMS {
            return VoiceSampleAudit(ok: false, reason: "clipping (RMS \(String(format: "%.4f", rms)))", durationSeconds: duration, rms: rms, peak: peak)
        }
        if peak > VoiceAuditThresholds.peakClip {
            return VoiceSampleAudit(ok: false, reason: "peaks clipped (\(String(format: "%.3f", peak)))", durationSeconds: duration, rms: rms, peak: peak)
        }
        return VoiceSampleAudit(ok: true, reason: "ok dur=\(String(format: "%.1f", duration))s rms=\(String(format: "%.3f", rms)) peak=\(String(format: "%.2f", peak))", durationSeconds: duration, rms: rms, peak: peak)
    }

    // ── Enrolment ──────────────────────────────────────────────────

    /// Compute a reference embedding from `samples` PCM utterances.
    /// Mirrors the desktop pipeline: embed, mean, normalise, drop
    /// outliers below `enrolmentOutlierCutoff`, re-average.
    ///
    /// Throws `notEnoughSamples` if fewer than `minSamples` survive.
    public static func enrollFromUtterances(
        samples: [Data],
        memberId: String
    ) async throws -> EnrolledReference {
        let enc = encoder
        // Embed every sample. We keep them all for the outlier pass even
        // though some may be borderline — the cosine check filters next.
        var embeddings: [[Float]] = []
        embeddings.reserveCapacity(samples.count)
        for pcm in samples {
            let emb = try await enc.embed(pcm: pcm)
            guard emb.count == enc.embeddingDim else {
                throw VoiceBiometricError.dimensionMismatch(expected: enc.embeddingDim, actual: emb.count)
            }
            embeddings.append(emb)
        }
        if embeddings.count < minSamples {
            throw VoiceBiometricError.notEnoughSamples(have: embeddings.count, need: minSamples)
        }
        // Initial reference = L2-normalised mean of all embeddings.
        var reference = l2normalise(meanVector(embeddings))
        // Drop outliers (cosine sim < cutoff). This catches utterances
        // that audited as "ok" in time-domain but are off in the
        // speaker-embedding space (background talker, weird mic angle).
        let kept = embeddings.filter { cosine($0, reference) >= enrolmentOutlierCutoff }
        if kept.count < minSamples {
            throw VoiceBiometricError.notEnoughSamples(have: kept.count, need: minSamples)
        }
        if kept.count < embeddings.count {
            // Re-average against only the survivors so the reference
            // isn't pulled by the rejected samples.
            reference = l2normalise(meanVector(kept))
        }
        return EnrolledReference(
            embedding: reference,
            memberId: memberId,
            createdAt: Date(),
            samplesUsed: kept.count,
            model: enc.modelId
        )
    }

    // ── Verify ─────────────────────────────────────────────────────

    /// Embed `utterance` and compare cosine similarity vs. `reference`.
    /// Returns the raw similarity and an accept/reject decision against
    /// the current threshold.
    public static func verify(
        utterance: Data,
        reference: EnrolledReference
    ) async throws -> (similarity: Float, accept: Bool) {
        let enc = encoder
        let candidate = try await enc.embed(pcm: utterance)
        guard candidate.count == reference.embedding.count else {
            throw VoiceBiometricError.dimensionMismatch(expected: reference.embedding.count, actual: candidate.count)
        }
        // Both vectors are L2-normalised, so cosine is just the dot.
        let sim = cosine(candidate, reference.embedding)
        return (sim, sim >= threshold)
    }
}

// ── Vector math (kept tiny + branchless; no Accelerate dep here so the
// module compiles cleanly on any iOS 17 target. Swap to vDSP if we ever
// need to verify in a tight inner loop.) ────────────────────────────

@usableFromInline
internal func cosine(_ a: [Float], _ b: [Float]) -> Float {
    precondition(a.count == b.count, "cosine: vector dim mismatch")
    var dot: Float = 0
    var na: Float = 0
    var nb: Float = 0
    for i in 0..<a.count {
        dot += a[i] * b[i]
        na += a[i] * a[i]
        nb += b[i] * b[i]
    }
    let denom = (na.squareRoot() * nb.squareRoot())
    return denom > 0 ? dot / denom : 0
}

@usableFromInline
internal func meanVector(_ vectors: [[Float]]) -> [Float] {
    precondition(!vectors.isEmpty, "meanVector: needs ≥1 vector")
    let dim = vectors[0].count
    var sum = [Float](repeating: 0, count: dim)
    for v in vectors {
        precondition(v.count == dim, "meanVector: dim mismatch")
        for i in 0..<dim { sum[i] += v[i] }
    }
    let n = Float(vectors.count)
    for i in 0..<dim { sum[i] /= n }
    return sum
}

@usableFromInline
internal func l2normalise(_ v: [Float]) -> [Float] {
    var ssq: Float = 0
    for x in v { ssq += x * x }
    let norm = ssq.squareRoot()
    if norm == 0 { return v }
    return v.map { $0 / norm }
}

@usableFromInline
internal func computeRMS(_ samples: [Float]) -> Float {
    if samples.isEmpty { return 0 }
    var ssq: Float = 0
    for x in samples { ssq += x * x }
    return (ssq / Float(samples.count)).squareRoot()
}

internal extension Data {
    /// Reinterpret raw bytes as `[Float]`. Assumes 32-bit little-endian
    /// floats, which matches AVAudioRecorder's `kAudioFormatLinearPCM`
    /// + `mFormatFlags = kAudioFormatFlagIsFloat | …LittleEndian`.
    /// On a malformed buffer (length not a multiple of 4) trailing bytes
    /// are ignored.
    ///
    /// Uses `loadUnaligned` rather than `bindMemory` so the call is safe
    /// regardless of the buffer's natural alignment — `Data`'s backing
    /// store is byte-aligned and the audio bridge prefixes a 4-byte
    /// header in some test paths.
    func toFloatArray() -> [Float] {
        let count = self.count / MemoryLayout<Float>.size
        guard count > 0 else { return [] }
        var out = [Float](repeating: 0, count: count)
        self.withUnsafeBytes { raw in
            for i in 0..<count {
                out[i] = raw.loadUnaligned(fromByteOffset: i * MemoryLayout<Float>.size,
                                            as: Float.self)
            }
        }
        return out
    }
}

// ── UnfairLock — minimal os_unfair_lock wrapper ─────────────────────
//
// Wraps a heap-allocated `os_unfair_lock_s` so the lock pointer is
// stable across copies (otherwise the struct would move and invalidate
// any in-progress lock acquisition). Used for the `threshold` /
// `encoder` accessors plus the `InMemoryReferenceStore` test helper.
//
// We don't lean on `OSAllocatedUnfairLock` because it's iOS 16+ and
// has Sendable-strictness we don't need here — this wrapper is
// equivalent for our purposes.

internal final class UnfairLock: @unchecked Sendable {
    private let _lock: UnsafeMutablePointer<os_unfair_lock_s>

    init() {
        _lock = UnsafeMutablePointer<os_unfair_lock_s>.allocate(capacity: 1)
        _lock.initialize(to: os_unfair_lock_s())
    }

    deinit {
        _lock.deinitialize(count: 1)
        _lock.deallocate()
    }

    func withLock<T>(_ body: () -> T) -> T {
        os_unfair_lock_lock(_lock)
        defer { os_unfair_lock_unlock(_lock) }
        return body()
    }
}
