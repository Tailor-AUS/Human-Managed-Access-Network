// HealthKitSignalTests.swift — exhaustive coverage of the four
// heuristic branches in HealthKitSignal.compute.
//
// We don't touch HKHealthStore here; the protocol-based provider
// `HealthKitProviding` lets us hand the adapter a fully-stubbed
// snapshot of vitals. That's deliberate — `swift test` runs on
// macos-14 in CI without a HealthKit host, and even on a real
// simulator HealthKit refuses to return values to unsigned binaries.

import XCTest
@testable import HMAN

@MainActor
final class HealthKitSignalTests: XCTestCase {
    // ── Branch 1: HR elevated, low motion → stressed ──────────────

    func testHRElevatedLowMotionScoresStressed() {
        let provider = StubProvider(
            lastHR: 90,           // 90 bpm
            lastHRV: 50,
            motionState: .still,
            baselineHR: 70,        // 90 / 70 = 1.29 → above 1.15 threshold
            baselineHRV: 50
        )
        let result = HealthKitSignal.compute(provider)
        XCTAssertEqual(result.score, -0.4, accuracy: 0.001)
        XCTAssertEqual(result.confidence, 0.7, accuracy: 0.001)
        XCTAssertEqual(result.reason, "HR up, you're sitting — likely stressed")
    }

    func testHRElevatedWithLightMotionAlsoCountsAsStressed() {
        // Light fidget at the desk still counts — we only exclude
        // sustained activity, where elevated HR is mechanical.
        let provider = StubProvider(
            lastHR: 95,
            lastHRV: 45,
            motionState: .light,
            baselineHR: 70,
            baselineHRV: 50
        )
        let result = HealthKitSignal.compute(provider)
        XCTAssertEqual(result.score, -0.4, accuracy: 0.001)
        XCTAssertEqual(result.reason, "HR up, you're sitting — likely stressed")
    }

    func testHRElevatedDuringActivityDoesNotTriggerStressed() {
        // Walking around → elevated HR is just exertion, not stress.
        // Should fall through to a different branch (or unknown).
        let provider = StubProvider(
            lastHR: 110,
            lastHRV: nil,         // no HRV → can't trigger recovery branch
            motionState: .active,
            baselineHR: 70,
            baselineHRV: nil
        )
        let result = HealthKitSignal.compute(provider)
        XCTAssertEqual(result, ReceptivityScore.unknown)
    }

    // ── Branch 2: Low HRV (post-effort recovery) ──────────────────

    func testLowHRVScoresRecovery() {
        // HRV at 60% of baseline → well under the 0.7 threshold.
        // HR not elevated, so branch 1 doesn't shadow this one.
        let provider = StubProvider(
            lastHR: 70,
            lastHRV: 30,
            motionState: .still,
            baselineHR: 70,
            baselineHRV: 50       // 30 / 50 = 0.6 < 0.7
        )
        let result = HealthKitSignal.compute(provider)
        XCTAssertEqual(result.score, -0.3, accuracy: 0.001)
        XCTAssertEqual(result.confidence, 0.6, accuracy: 0.001)
        XCTAssertEqual(result.reason, "HRV low post-effort, give it a minute")
    }

    // ── Branch 3: Calm baseline ────────────────────────────────────

    func testVitalsAtBaselineScoresCalm() {
        // HR and HRV both within ±10 % of the rolling baseline.
        let provider = StubProvider(
            lastHR: 72,            // 72 / 70 = 1.029 → within 10 %
            lastHRV: 48,           // 48 / 50 = 0.96 → within 10 %
            motionState: .still,
            baselineHR: 70,
            baselineHRV: 50
        )
        let result = HealthKitSignal.compute(provider)
        XCTAssertEqual(result.score, 0.2, accuracy: 0.001)
        XCTAssertEqual(result.confidence, 0.5, accuracy: 0.001)
        XCTAssertEqual(result.reason, "vitals at baseline")
    }

    func testVitalsJustOutsideBaselineDoNotScoreCalm() {
        // HR 12 % above baseline → outside the ±10 % calm window,
        // but still under the 15 % "stressed" threshold from branch 1.
        // Should fall through to .unknown.
        let provider = StubProvider(
            lastHR: 78.4,          // 78.4 / 70 = 1.12 → outside ±10 %, under 1.15
            lastHRV: 49,           // within ±10 %
            motionState: .still,
            baselineHR: 70,
            baselineHRV: 50
        )
        let result = HealthKitSignal.compute(provider)
        XCTAssertEqual(result, ReceptivityScore.unknown)
    }

    // ── Branch 4: insufficient data → unknown ──────────────────────

    func testNoDataReturnsUnknown() {
        let provider = StubProvider()  // all nil, motion .unknown
        let result = HealthKitSignal.compute(provider)
        XCTAssertEqual(result, ReceptivityScore.unknown)
        XCTAssertEqual(result.confidence, 0.0)
    }

    func testHRWithoutBaselineReturnsUnknown() {
        // First-run installs have no rolling baseline yet; we should
        // refuse to act on a single sample without context.
        let provider = StubProvider(
            lastHR: 95,
            lastHRV: nil,
            motionState: .still,
            baselineHR: nil,
            baselineHRV: nil
        )
        let result = HealthKitSignal.compute(provider)
        XCTAssertEqual(result, ReceptivityScore.unknown)
    }

    // ── ReceptivityScore clamping ──────────────────────────────────

    func testScoreClampedToValidRange() {
        let high = ReceptivityScore(score: 5.0, confidence: 2.0, reason: "x")
        XCTAssertEqual(high.score, 1.0)
        XCTAssertEqual(high.confidence, 1.0)

        let low = ReceptivityScore(score: -5.0, confidence: -1.0, reason: "x")
        XCTAssertEqual(low.score, -1.0)
        XCTAssertEqual(low.confidence, 0.0)
    }
}

// ── Stub provider ──────────────────────────────────────────────────

/// In-memory `HealthKitProviding` for unit tests. No HealthKit calls,
/// no async — just a snapshot of values the adapter consumes.
@MainActor
private final class StubProvider: HealthKitProviding {
    var lastHR: Double?
    var lastHRV: Double?
    var motionState: MotionState
    var lastSleep: SleepSummary?
    var baselineHR: Double?
    var baselineHRV: Double?

    init(
        lastHR: Double? = nil,
        lastHRV: Double? = nil,
        motionState: MotionState = .unknown,
        lastSleep: SleepSummary? = nil,
        baselineHR: Double? = nil,
        baselineHRV: Double? = nil
    ) {
        self.lastHR = lastHR
        self.lastHRV = lastHRV
        self.motionState = motionState
        self.lastSleep = lastSleep
        self.baselineHR = baselineHR
        self.baselineHRV = baselineHRV
    }
}
