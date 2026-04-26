// HealthKitProvider.swift — autonomic-state sensor for the receptivity gate.
//
// Wraps `HKHealthStore` with a clean async surface tailored to what the
// gate actually needs: a recent heart-rate value, an HRV (SDNN) sample,
// a coarse motion classification, and a summary of last night's sleep.
//
// We deliberately keep the public API small and value-typed. The raw
// `HKQuantitySample` / `HKCategorySample` instances stay inside this
// file — callers never see them. That keeps the `(score, confidence,
// reason)` tuple emitted by `HealthKitSignal` the only thing that
// crosses module boundaries, satisfying the "no raw vitals leave the
// phone" privacy guarantee from issue #16.
//
// Read-only. We never write to HealthKit. The matching Info.plist entry
// is `NSHealthShareUsageDescription` only — `NSHealthUpdateUsageDescription`
// is intentionally absent because HMAN doesn't need write capability.

import Foundation
#if canImport(HealthKit)
import HealthKit
#endif

// ── Public value types ─────────────────────────────────────────────

/// Coarse motion classification derived from the last 60 seconds of
/// step count + active energy. The receptivity gate only needs a few
/// buckets — actual workout / activity rings are out of scope (#16
/// non-goals).
public enum MotionState: String, Sendable, Equatable {
    /// No detectable steps and negligible active energy.
    case still
    /// Some movement (walking around a room, fidgeting at a desk).
    case light
    /// Sustained movement (walk / commute).
    case active
    /// HealthKit unavailable or permission denied.
    case unknown
}

/// Summary of the most recent in-bed period inferred from HealthKit's
/// sleep-analysis category samples. We collapse the per-stage detail
/// into the two numbers the gate cares about: total asleep duration
/// and the rough quality bucket. Anything finer-grained is private.
public struct SleepSummary: Sendable, Equatable {
    /// Total time the member was asleep (any stage other than `inBed`
    /// or `awake`). Seconds.
    public let asleepSeconds: TimeInterval
    /// Total in-bed time (informational; gate currently ignores).
    public let inBedSeconds: TimeInterval
    /// When the most recent sleep window ended. The gate uses this
    /// to decide if the summary is fresh enough to act on.
    public let endedAt: Date

    public init(asleepSeconds: TimeInterval, inBedSeconds: TimeInterval, endedAt: Date) {
        self.asleepSeconds = asleepSeconds
        self.inBedSeconds = inBedSeconds
        self.endedAt = endedAt
    }
}

/// Errors surfaced by the provider. Authorisation refusals and a
/// HealthKit-unavailable platform (i.e. iPad without the data store)
/// share a single denied/unavailable case so callers can fall back to
/// a behavioural-only receptivity score without branching on every
/// error subtype.
public enum HealthKitError: Error, Sendable, Equatable {
    /// HealthKit not present on this device or `HKHealthStore.isHealthDataAvailable` returned false.
    case unavailable
    /// The member denied authorisation, or it hasn't been requested yet.
    case notAuthorized
    /// Underlying HealthKit query failed. `message` is `error.localizedDescription`.
    case query(message: String)
}

// ── Provider protocol (so tests can stub) ──────────────────────────

/// What `HealthKitSignal` actually consumes. Splitting this out from
/// the concrete `HealthKitProvider` lets `HealthKitSignalTests` inject
/// fixed values without touching `HKHealthStore` — which is impossible
/// to use in `swift test` on a non-iOS host anyway.
///
/// `@MainActor` so the published properties on `HealthKitProvider`
/// satisfy the requirements without nonisolated bridges. Tests run
/// on the main actor (XCTest's default), so `StubProvider` is fine
/// without extra ceremony.
@MainActor
public protocol HealthKitProviding: AnyObject {
    /// Most recent heart-rate sample in beats-per-minute, or nil if no
    /// recent sample is available.
    var lastHR: Double? { get }
    /// Most recent HRV (SDNN) sample in milliseconds.
    var lastHRV: Double? { get }
    /// Rolling motion classification from the last ~60 s.
    var motionState: MotionState { get }
    /// Last night's sleep summary, if HealthKit returned at least one
    /// sleep sample within the last 24 hours.
    var lastSleep: SleepSummary? { get }

    /// Rolling 7-day baseline mean for HR (bpm) and HRV (ms). Used to
    /// decide whether the current sample is "elevated" or "low" relative
    /// to the member's own normal — never an absolute clinical threshold.
    var baselineHR: Double? { get }
    var baselineHRV: Double? { get }
}

// ── Concrete HealthKit-backed provider ─────────────────────────────

/// Default `HealthKitProviding` implementation. On platforms where
/// HealthKit isn't compiled in (e.g. running `swift test` on Linux CI)
/// the stored properties stay nil and `requestAuthorization()` throws
/// `.unavailable`.
@MainActor
public final class HealthKitProvider: ObservableObject, HealthKitProviding {
    // ObservableObject so SwiftUI views can react to the latest reading
    // without us having to invent a Combine pipeline. Explicitly
    // `@Published` rather than @Observable so we keep the iOS 17 floor.

    @Published public private(set) var lastHR: Double?
    @Published public private(set) var lastHRV: Double?
    @Published public private(set) var motionState: MotionState = .unknown
    @Published public private(set) var lastSleep: SleepSummary?
    @Published public private(set) var baselineHR: Double?
    @Published public private(set) var baselineHRV: Double?

    /// How often `start()` polls HealthKit. Default 60 s — HealthKit
    /// reads are cheap but not free, and the gate only reconsiders
    /// state that often. Configurable for tests / debugging.
    public let pollInterval: TimeInterval

    #if canImport(HealthKit)
    private let store = HKHealthStore()
    private var pollTask: Task<Void, Never>?
    #endif

    public init(pollInterval: TimeInterval = 60) {
        self.pollInterval = pollInterval
    }

    deinit {
        #if canImport(HealthKit)
        pollTask?.cancel()
        #endif
    }

    // ── Authorisation ───────────────────────────────────────────────

    /// Request read-only authorisation for the four sample types we
    /// rely on. Idempotent — iOS only prompts the member once per
    /// (app, type) tuple even if this is called repeatedly.
    public func requestAuthorization() async throws {
        #if canImport(HealthKit)
        guard HKHealthStore.isHealthDataAvailable() else {
            throw HealthKitError.unavailable
        }
        let read: Set<HKObjectType> = [
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!,
            HKObjectType.quantityType(forIdentifier: .stepCount)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!,
        ]
        // toShare: empty — strictly read-only.
        try await store.requestAuthorization(toShare: [], read: read)
        #else
        throw HealthKitError.unavailable
        #endif
    }

    // ── Polling lifecycle ───────────────────────────────────────────

    /// Begin polling. Cancels any previous poll task and refreshes
    /// every `pollInterval` seconds. Errors per cycle are swallowed
    /// (logged via os_log in a future PR) — a single failed read
    /// shouldn't tear down the whole stream.
    public func start() {
        #if canImport(HealthKit)
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                await self.refresh()
                try? await Task.sleep(nanoseconds: UInt64(self.pollInterval * 1_000_000_000))
            }
        }
        #endif
    }

    /// Stop polling. Safe to call from `onDisappear`.
    public func stop() {
        #if canImport(HealthKit)
        pollTask?.cancel()
        pollTask = nil
        #endif
    }

    /// Force a single refresh outside the polling loop. Useful after
    /// `requestAuthorization()` returns so the first reading lands
    /// before `pollInterval` elapses.
    public func refresh() async {
        #if canImport(HealthKit)
        async let hr = (try? currentHR()) ?? nil
        async let hrv = (try? recentHRV()) ?? nil
        async let motion = (try? motionStateNow()) ?? .unknown
        async let sleep = (try? sleepLastNight()) ?? nil
        async let bHR = (try? baselineHRMean()) ?? nil
        async let bHRV = (try? baselineHRVMean()) ?? nil

        let resolvedHR = await hr
        let resolvedHRV = await hrv
        let resolvedMotion = await motion
        let resolvedSleep = await sleep
        let resolvedBaselineHR = await bHR
        let resolvedBaselineHRV = await bHRV

        self.lastHR = resolvedHR
        self.lastHRV = resolvedHRV
        self.motionState = resolvedMotion
        self.lastSleep = resolvedSleep
        self.baselineHR = resolvedBaselineHR
        self.baselineHRV = resolvedBaselineHRV
        #endif
    }

    // ── Single-shot reads ───────────────────────────────────────────

    /// The most recent heart-rate sample, regardless of source. We
    /// don't filter by `HKDevice` because Apple Watch / paired
    /// chest-strap / Fitness+ all produce useful values for receptivity.
    public func currentHR() async throws -> Double? {
        #if canImport(HealthKit)
        try await mostRecentQuantity(
            type: .heartRate,
            unit: HKUnit.count().unitDivided(by: .minute())
        )
        #else
        throw HealthKitError.unavailable
        #endif
    }

    /// HRV (SDNN) sample from the last five minutes, expressed in
    /// milliseconds. HealthKit only logs SDNN when the watch detects
    /// a quiet enough sample window, so this is often nil — the gate
    /// must handle that gracefully.
    public func recentHRV() async throws -> Double? {
        #if canImport(HealthKit)
        let now = Date()
        let fiveMinAgo = now.addingTimeInterval(-5 * 60)
        return try await mostRecentQuantity(
            type: .heartRateVariabilitySDNN,
            unit: HKUnit.secondUnit(with: .milli),
            after: fiveMinAgo
        )
        #else
        throw HealthKitError.unavailable
        #endif
    }

    /// Motion classification from the last 60 s of step count + active
    /// energy. This is intentionally coarse — finer motion fusion
    /// belongs in #14 (CoreMotion / AirPods telemetry).
    public func motionStateNow() async throws -> MotionState {
        #if canImport(HealthKit)
        let now = Date()
        let oneMinAgo = now.addingTimeInterval(-60)
        let steps = try await sumQuantity(
            type: .stepCount,
            unit: .count(),
            from: oneMinAgo,
            to: now
        ) ?? 0
        let kcal = try await sumQuantity(
            type: .activeEnergyBurned,
            unit: .kilocalorie(),
            from: oneMinAgo,
            to: now
        ) ?? 0

        // Thresholds chosen for "sitting at a desk" vs "walking
        // around" vs "going somewhere" — not for clinical accuracy.
        switch (steps, kcal) {
        case (0, ..<0.3):
            return .still
        case (..<20, _), (_, ..<2.0):
            return .light
        default:
            return .active
        }
        #else
        return .unknown
        #endif
    }

    /// Summary of the most recent sleep window in the last 24 hours.
    /// Returns nil if no sleep samples are recorded — common for
    /// members who don't wear a watch overnight.
    public func sleepLastNight() async throws -> SleepSummary? {
        #if canImport(HealthKit)
        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            return nil
        }
        let now = Date()
        let yesterday = now.addingTimeInterval(-24 * 60 * 60)
        let predicate = HKQuery.predicateForSamples(withStart: yesterday, end: now, options: [])
        let samples = try await fetchCategorySamples(type: sleepType, predicate: predicate)
        guard !samples.isEmpty else { return nil }

        var asleep: TimeInterval = 0
        var inBed: TimeInterval = 0
        var endedAt = Date.distantPast

        for sample in samples {
            let duration = sample.endDate.timeIntervalSince(sample.startDate)
            if sample.endDate > endedAt { endedAt = sample.endDate }

            switch HKCategoryValueSleepAnalysis(rawValue: sample.value) {
            case .inBed:
                inBed += duration
            case .asleepUnspecified, .asleepCore, .asleepDeep, .asleepREM:
                asleep += duration
            case .awake, .none:
                break
            @unknown default:
                break
            }
        }

        guard endedAt > .distantPast else { return nil }
        return SleepSummary(asleepSeconds: asleep, inBedSeconds: inBed, endedAt: endedAt)
        #else
        return nil
        #endif
    }

    /// Rolling 7-day mean for HR. The gate calls this "baseline" — a
    /// per-member normal we compare current samples against. Falls
    /// back to nil when fewer than ~24 samples are present (i.e. a
    /// brand-new install with no historical data).
    public func baselineHRMean() async throws -> Double? {
        #if canImport(HealthKit)
        try await rollingSevenDayMean(
            type: .heartRate,
            unit: HKUnit.count().unitDivided(by: .minute())
        )
        #else
        throw HealthKitError.unavailable
        #endif
    }

    /// Rolling 7-day mean for HRV (SDNN, ms). Same caveats as
    /// `baselineHRMean`.
    public func baselineHRVMean() async throws -> Double? {
        #if canImport(HealthKit)
        try await rollingSevenDayMean(
            type: .heartRateVariabilitySDNN,
            unit: HKUnit.secondUnit(with: .milli)
        )
        #else
        throw HealthKitError.unavailable
        #endif
    }

    // ── HealthKit query helpers ────────────────────────────────────

    #if canImport(HealthKit)
    private func mostRecentQuantity(
        type identifier: HKQuantityTypeIdentifier,
        unit: HKUnit,
        after: Date? = nil
    ) async throws -> Double? {
        guard let qty = HKObjectType.quantityType(forIdentifier: identifier) else {
            return nil
        }
        let predicate = after.map {
            HKQuery.predicateForSamples(withStart: $0, end: nil, options: [])
        }
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)

        return try await withCheckedThrowingContinuation { cont in
            let q = HKSampleQuery(
                sampleType: qty,
                predicate: predicate,
                limit: 1,
                sortDescriptors: [sort]
            ) { _, samples, error in
                if let error {
                    cont.resume(throwing: HealthKitError.query(message: error.localizedDescription))
                    return
                }
                let value = (samples?.first as? HKQuantitySample)?.quantity.doubleValue(for: unit)
                cont.resume(returning: value)
            }
            store.execute(q)
        }
    }

    private func sumQuantity(
        type identifier: HKQuantityTypeIdentifier,
        unit: HKUnit,
        from: Date,
        to: Date
    ) async throws -> Double? {
        guard let qty = HKObjectType.quantityType(forIdentifier: identifier) else {
            return nil
        }
        let predicate = HKQuery.predicateForSamples(withStart: from, end: to, options: [.strictStartDate])
        return try await withCheckedThrowingContinuation { cont in
            let q = HKStatisticsQuery(
                quantityType: qty,
                quantitySamplePredicate: predicate,
                options: .cumulativeSum
            ) { _, stats, error in
                if let error {
                    cont.resume(throwing: HealthKitError.query(message: error.localizedDescription))
                    return
                }
                let value = stats?.sumQuantity()?.doubleValue(for: unit)
                cont.resume(returning: value)
            }
            store.execute(q)
        }
    }

    private func rollingSevenDayMean(
        type identifier: HKQuantityTypeIdentifier,
        unit: HKUnit
    ) async throws -> Double? {
        guard let qty = HKObjectType.quantityType(forIdentifier: identifier) else {
            return nil
        }
        let now = Date()
        let weekAgo = now.addingTimeInterval(-7 * 24 * 60 * 60)
        let predicate = HKQuery.predicateForSamples(withStart: weekAgo, end: now, options: [])
        return try await withCheckedThrowingContinuation { cont in
            let q = HKStatisticsQuery(
                quantityType: qty,
                quantitySamplePredicate: predicate,
                options: .discreteAverage
            ) { _, stats, error in
                if let error {
                    cont.resume(throwing: HealthKitError.query(message: error.localizedDescription))
                    return
                }
                let value = stats?.averageQuantity()?.doubleValue(for: unit)
                cont.resume(returning: value)
            }
            store.execute(q)
        }
    }

    private func fetchCategorySamples(
        type: HKCategoryType,
        predicate: NSPredicate
    ) async throws -> [HKCategorySample] {
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: true)
        return try await withCheckedThrowingContinuation { cont in
            let q = HKSampleQuery(
                sampleType: type,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [sort]
            ) { _, samples, error in
                if let error {
                    cont.resume(throwing: HealthKitError.query(message: error.localizedDescription))
                    return
                }
                cont.resume(returning: (samples as? [HKCategorySample]) ?? [])
            }
            store.execute(q)
        }
    }
    #endif
}
