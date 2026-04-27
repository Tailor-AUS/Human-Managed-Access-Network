// HealthKitSignal.swift — adapter from HealthKit readings to the
// receptivity gate's `(score, confidence, reason)` contract.
//
// The receptivity gate (#4, see packages/python-bridge/receptivity)
// composes signals from many sources. Each source emits a normalised
// triple:
//
//     score:      [-1.0 ... +1.0]   negative = don't interrupt, positive = interrupt freely
//     confidence: [ 0.0 ...  1.0]   how much weight to give this signal
//     reason:     short whisperable string the gate may surface verbally
//
// Note: the iOS-side adapter uses the [-1, +1] range from issue #16;
// the Python bridge currently uses [0, 1]. The bridge will rescale
// when these signals reach it — keeping the iOS contract symmetric
// makes "don't interrupt" vs "interrupt" semantics explicit.
//
// The four heuristic branches we implement match the issue body
// exactly; thresholds are intentionally conservative because we'd
// rather under-interrupt than nag a stressed member.

import Foundation

// ── Public contract ────────────────────────────────────────────────

/// One normalised signal contribution toward the gate's composite
/// receptivity decision. Treated as Sendable so it can cross actor
/// boundaries (e.g. from `@MainActor` UI into a background bridge
/// uploader without copies).
public struct ReceptivityScore: Sendable, Equatable {
    /// -1.0 = "definitely don't interrupt"; +1.0 = "go ahead". Zero
    /// is neutral / no information.
    public let score: Double
    /// 0.0 = ignore me; 1.0 = trust me fully. The gate multiplies
    /// score * confidence when blending.
    public let confidence: Double
    /// Member-facing one-liner. Kept short enough to whisper through
    /// TTS without cutting into the daily voice-word budget.
    public let reason: String

    public init(score: Double, confidence: Double, reason: String) {
        // Clamp at the boundary in case a future heuristic over-shoots.
        self.score = max(-1.0, min(1.0, score))
        self.confidence = max(0.0, min(1.0, confidence))
        self.reason = reason
    }

    /// Sentinel for "nothing useful to say" — confidence zero so the
    /// gate ignores it, neutral score, neutral reason.
    public static let unknown = ReceptivityScore(
        score: 0,
        confidence: 0,
        reason: "no autonomic data"
    )
}

// ── Heuristic logic ────────────────────────────────────────────────

/// Stateless adapter. Given the latest readings on a `HealthKitProviding`,
/// compute a single `ReceptivityScore`. No side effects, no I/O —
/// trivially testable with a mock provider.
public enum HealthKitSignal {
    /// Branch order matters: more specific stress conditions first,
    /// then post-effort recovery, then the calm-baseline boost. Once
    /// any branch matches we return — composition with other signals
    /// happens in the gate, not here.
    ///
    /// `@MainActor` because `HealthKitProviding` is main-actor isolated
    /// (matches `HealthKitProvider`'s @Published vars). Call from
    /// SwiftUI / other main-actor contexts directly; from a background
    /// task, hop with `await MainActor.run { ... }`.
    @MainActor
    public static func compute(_ provider: HealthKitProviding) -> ReceptivityScore {
        // ── 1. HR elevated, low motion → likely stressed ────────────
        if let hr = provider.lastHR,
           let baseline = provider.baselineHR,
           hr > baseline * 1.15,
           provider.motionState == .still || provider.motionState == .light
        {
            return ReceptivityScore(
                score: -0.4,
                confidence: 0.7,
                reason: "HR up, you're sitting — likely stressed"
            )
        }

        // ── 2. Low HRV (post-effort recovery) ───────────────────────
        // SDNN drops sharply after exertion; the gate uses this to
        // give a member a few minutes before pushing anything voice.
        if let hrv = provider.lastHRV,
           let baseline = provider.baselineHRV,
           hrv < baseline * 0.7
        {
            return ReceptivityScore(
                score: -0.3,
                confidence: 0.6,
                reason: "HRV low post-effort, give it a minute"
            )
        }

        // ── 3. Calm baseline (HR + HRV both at rolling-7-day normal)
        // Both must be present and within ±10 % of the member's own
        // average. This is the only positive (interrupt-OK) branch.
        if let hr = provider.lastHR,
           let hrBaseline = provider.baselineHR,
           let hrv = provider.lastHRV,
           let hrvBaseline = provider.baselineHRV,
           withinTolerance(hr, of: hrBaseline, fraction: 0.10),
           withinTolerance(hrv, of: hrvBaseline, fraction: 0.10)
        {
            return ReceptivityScore(
                score: +0.2,
                confidence: 0.5,
                reason: "vitals at baseline"
            )
        }

        // ── 4. Insufficient data → no opinion. The gate composes
        // with behavioural / calendar signals when we say nothing.
        return .unknown
    }

    /// Helper for the calm-baseline branch. `value` must lie within
    /// `fraction` of `target` (relative, not absolute) on either side.
    private static func withinTolerance(_ value: Double, of target: Double, fraction: Double) -> Bool {
        guard target > 0 else { return false }
        let delta = abs(value - target) / target
        return delta <= fraction
    }
}
