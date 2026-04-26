// RECEPTIVITY_INPUTS.swift — sensor fan-in for the (future) ReceptivityGate.
//
// This file is the seam between Wave 2's sensor PRs (this one, #16 HealthKit,
// future watch-bridge) and the ReceptivityGate work tracked in #4. Each
// sensor publishes its own narrow signal; this object aggregates the slice
// the gate cares about and re-publishes as one `ObservableObject` so the
// gate, the SwiftUI debug surface, and the bridge-uploader can all subscribe
// without knowing about every sensor type individually.
//
// Naming: the screaming snake-case is intentional — it stands out in the
// file tree as "this is the public contract surface" rather than yet
// another model class. Don't rename without coordinating with #4.
//
// Threading: `@Published` mutations require the main thread but Swift
// concurrency's `@MainActor` isolation is intentionally avoided here so
// callers (SwiftUI views, the gate, tests) can construct the aggregator
// from any context. Internally every sink uses `.receive(on: RunLoop.main)`
// so the SwiftUI subscriber contract is preserved.

import Foundation
import Combine

/// Coarse motion classification. The detector publishes raw gestures; the
/// gate cares about *state* — "is the head still right now?" Not every
/// upstream sensor will populate this; the watch-bridge / activity-classifier
/// PRs fill in the rest.
public enum MotionState: String, Sendable, Equatable {
    case still
    case walking
    case running
    case driving
    case unknown
}

public final class ReceptivityInputs: ObservableObject, @unchecked Sendable {
    // ── Inputs the gate currently consumes ─────────────────────────────

    /// True when AirPods (or another headphone-shaped route) is presenting
    /// audio. Re-published from `AirPodsPresence`.
    @Published public private(set) var inEar: Bool = false

    /// True when *any* headphone-shaped route is active. Slightly looser
    /// than `inEar`; the gate uses this when deciding whether to route
    /// audible TTS replies vs. visual-only.
    @Published public private(set) var headphonesActive: Bool = false

    /// Coarse motion. `unknown` until the watch-bridge / motion-classifier
    /// fills it in.
    @Published public private(set) var motionState: MotionState = .unknown

    /// Last discrete head gesture, if any. `nil` after debounce clears.
    @Published public private(set) var lastHeadGesture: Gesture? = nil

    /// Last ambient-audio RMS, in `[0, 1]`-ish. Re-published from
    /// `AmbientAudio`.
    @Published public private(set) var ambientRMS: Float = 0

    // ── Wiring ─────────────────────────────────────────────────────────

    public let airpods: AirPodsPresence
    public let gestures: HeadGestureDetector
    public let ambient: AmbientAudio

    private var cancellables: Set<AnyCancellable> = []

    public init(
        airpods: AirPodsPresence = AirPodsPresence(),
        gestures: HeadGestureDetector = HeadGestureDetector(),
        ambient: AmbientAudio = AmbientAudio()
    ) {
        self.airpods = airpods
        self.gestures = gestures
        self.ambient = ambient

        airpods.$inEar
            .receive(on: RunLoop.main)
            .sink { [weak self] in self?.inEar = $0 }
            .store(in: &cancellables)

        airpods.$headphonesActive
            .receive(on: RunLoop.main)
            .sink { [weak self] in self?.headphonesActive = $0 }
            .store(in: &cancellables)

        gestures.gestures
            .receive(on: RunLoop.main)
            .sink { [weak self] g in self?.lastHeadGesture = (g == .none ? nil : g) }
            .store(in: &cancellables)

        ambient.$rms
            .receive(on: RunLoop.main)
            .sink { [weak self] in self?.ambientRMS = $0 }
            .store(in: &cancellables)
    }

    /// Boot all sensors at once. Called from the SwiftUI app on launch
    /// (after permissions). Safe to call multiple times.
    public func startAll() {
        gestures.start()
        ambient.start()
    }

    public func stopAll() {
        gestures.stop()
        ambient.stop()
    }

    /// Allow the (future) motion-classifier to push state in. Kept narrow so
    /// the gate doesn't accidentally couple to `CMMotionActivity`.
    public func updateMotionState(_ state: MotionState) {
        self.motionState = state
    }
}
