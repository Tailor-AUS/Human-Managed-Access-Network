// EnrollmentFlow.swift — coordinator for the 10-prompt enrolment UX.
//
// Mirrors the desktop's `enroll_voice.py` loop:
//
//   for prompt in PROMPTS:
//       record an utterance
//       audit it (duration, RMS, peak)
//       if ok: keep
//       if not: prompt the user to retry
//   compute reference embedding from collected samples
//   drop outliers, re-average
//   persist
//
// The flow is split into a model layer (this file) and a SwiftUI view
// (rendered in `OnboardingView`). The model exposes published state so
// the view can drive recording UI without owning the audio stack — the
// caller pipes recorded `Data` blobs in via `submitSample`. This keeps
// `AVAudioRecorder` out of the package's public surface and makes the
// flow testable with synthetic audio.
//
// Prompts are the canonical 10 from `packages/python-bridge/core.py`.
// They're identical for every member so the reference captures voice,
// not biography.

import Foundation
import Combine

public enum EnrollmentFlowError: Error, Sendable, Equatable {
    case alreadyComplete
    case sampleRejected(reason: String)
    case enrolmentFailed(String)
    case persistenceFailed(String)
}

/// What the view should render for the current step.
public enum EnrollmentStage: Sendable, Equatable {
    /// Awaiting the user's recording for `prompts[index]`.
    case recording(index: Int, prompt: String)
    /// Done — embedding computed and stored. `samplesUsed` reflects
    /// how many survived the outlier filter.
    case complete(memberId: String, samplesUsed: Int)
    /// Hard failure. UI should show the message and offer "start over".
    case failed(reason: String)
}

/// Canonical 10-prompt phonetic sequence. Matches
/// `packages/python-bridge/core.py::PROMPTS` byte-for-byte so the same
/// audit logs format identically across desktop + iOS enrolment.
public let kEnrollmentPrompts: [String] = [
    "My subconscious stays here. Local, encrypted, mine alone.",
    "Once I speak, nothing else in the room can activate it.",
    "Three green lights. Two amber. One guarantee: my consent.",
    "The quick brown fox jumps over the lazy dog beside the blue lake.",
    "Seven, fourteen, twenty-one, forty-two, one hundred and nine.",
    "Shadows fall on polished marble as the evening settles in.",
    "If no one asks, I stay silent. If I speak, I am brief.",
    "Thursday, August the eighteenth, nineteen ninety-eight, six-thirty PM.",
    "She writes. She walks. She thinks. She breathes. She answers.",
    "Checking, sending, logged, saved, done. Calm and precise.",
]

/// Coordinator the SwiftUI layer drives. The class is `@MainActor` so
/// `@Published` updates are safe to bind from views without further
/// hopping; long-running work (encoder inference) happens on a
/// detached task and lands back on main before mutating state.
@MainActor
public final class EnrollmentFlow: ObservableObject {
    @Published public private(set) var stage: EnrollmentStage
    @Published public private(set) var collectedCount: Int = 0
    @Published public private(set) var lastAudit: VoiceSampleAudit?

    public let memberId: String
    public let prompts: [String]
    private let store: ReferenceStore

    private var samples: [Data] = []

    public init(
        memberId: String,
        prompts: [String] = kEnrollmentPrompts,
        store: ReferenceStore = EncryptedReferenceStore()
    ) {
        self.memberId = memberId
        self.prompts = prompts
        self.store = store
        self.stage = .recording(index: 0, prompt: prompts.first ?? "")
    }

    /// Total prompts in the sequence. `collectedCount / promptCount`
    /// gives a progress fraction for the UI.
    public var promptCount: Int { prompts.count }

    /// Submit a recorded utterance. The flow audits it; on `ok` it
    /// advances to the next prompt and (when all samples are in)
    /// computes the reference and persists it.
    ///
    /// Returns the audit result so the view can render the per-sample
    /// status line (matches the desktop CLI's `[i/n] ok dur=…` log).
    @discardableResult
    public func submitSample(_ pcm: Data) async throws -> VoiceSampleAudit {
        guard case let .recording(index, _) = stage else {
            throw EnrollmentFlowError.alreadyComplete
        }
        let audit = VoiceBiometric.audit(pcm: pcm)
        self.lastAudit = audit
        guard audit.ok else {
            // Don't advance — caller should re-prompt the same index.
            throw EnrollmentFlowError.sampleRejected(reason: audit.reason)
        }
        samples.append(pcm)
        collectedCount = samples.count
        let next = index + 1
        if next < prompts.count {
            stage = .recording(index: next, prompt: prompts[next])
        } else {
            await finalise()
        }
        return audit
    }

    /// Skip the current prompt (e.g. user tapped "skip" after multiple
    /// failed retries). Allowed only if there are still ≥3 prompts
    /// remaining so we can hit `VoiceBiometric.minSamples`.
    public func skipCurrent() {
        guard case let .recording(index, _) = stage else { return }
        let next = index + 1
        if next < prompts.count {
            stage = .recording(index: next, prompt: prompts[next])
        } else {
            Task { await finalise() }
        }
    }

    /// Reset the flow to start over. Wipes any in-memory samples; does
    /// NOT touch a previously persisted reference (the user can still
    /// fall back on it via the Keychain entry).
    public func reset() {
        samples.removeAll()
        collectedCount = 0
        lastAudit = nil
        stage = .recording(index: 0, prompt: prompts.first ?? "")
    }

    // ── Internal ───────────────────────────────────────────────────

    private func finalise() async {
        do {
            let reference = try await VoiceBiometric.enrollFromUtterances(
                samples: samples,
                memberId: memberId
            )
            try store.save(reference)
            stage = .complete(memberId: memberId, samplesUsed: reference.samplesUsed)
        } catch let err as VoiceBiometricError {
            stage = .failed(reason: describe(err))
        } catch let err as ReferenceStoreError {
            stage = .failed(reason: "could not store reference: \(err)")
        } catch {
            stage = .failed(reason: String(describing: error))
        }
    }

    private func describe(_ err: VoiceBiometricError) -> String {
        switch err {
        case .notEnoughSamples(let have, let need):
            return "only \(have) usable samples; need ≥\(need)"
        case .audioRejected(let reason):
            return "audio rejected: \(reason)"
        case .encoderFailed(let detail):
            return "encoder failed: \(detail)"
        case .dimensionMismatch(let expected, let actual):
            return "embedding dim mismatch: expected \(expected), got \(actual)"
        }
    }
}
