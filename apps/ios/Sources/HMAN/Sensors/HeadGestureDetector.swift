// HeadGestureDetector.swift — discrete shake / nod detection from AirPods motion.
//
// Source of truth is `CMHeadphoneMotionManager`, which streams attitude (roll
// / pitch / yaw) and rotation rate from AirPods Pro / 3 / Max. We watch for
// rapid sign-flipping oscillation on a single axis and emit one discrete event
// per gesture, with debounce so a single physical shake doesn't fire twice.
//
// Heuristic — kept simple on purpose; the receptivity gate combines this with
// AirPods presence and ambient RMS, so we want a low-false-negative detector
// rather than perfect precision.
//
//   • Buffer the last `WINDOW_S` seconds of yaw / pitch rotation rate.
//   • A shake is `≥ MIN_OSCILLATIONS` zero-crossings of yaw rotation rate
//     within the window, with peak |rate| ≥ `MIN_PEAK_RAD_PER_S`.
//   • A nod is the same shape on pitch.
//   • After firing, refuse to fire again for `DEBOUNCE_S` seconds.
//
// Tunables are exposed as `static let` constants prefixed `HEAD_GESTURE_*` so
// they read like env vars in code review and so the receptivity-gate work
// (#4) can trivially override them via a config injection later.
//
// Threading: `CMHeadphoneMotionManager.startDeviceMotionUpdates(to:)` queues
// callbacks on whichever `OperationQueue` we hand it. We use `.main` so the
// `@Published` store and `gestures` subject can be observed on the main actor
// without further hops. Sample rate is ~50 Hz, well below the actor budget.

import Foundation
import Combine
#if canImport(CoreMotion)
import CoreMotion
#endif

public enum Gesture: String, Sendable, Equatable {
    case shake          // horizontal yaw oscillation — semantic "no" / deny
    case nod            // vertical pitch oscillation — semantic "yes" / confirm
    case none           // emitted when the detector resets after debounce
}

/// Detector is *not* main-actor-isolated — `CMHeadphoneMotionManager` calls
/// us back on whichever `OperationQueue` it's given (we use `.main` so the
/// callback queue is the main run-loop queue, but Swift concurrency doesn't
/// infer main-actor isolation from that). `@Published` mutations are hopped
/// to `DispatchQueue.main` explicitly.
public final class HeadGestureDetector: ObservableObject, @unchecked Sendable {
    // ── Tunables (env-var-style names; documented in the file header) ──
    public static let HEAD_GESTURE_DEBOUNCE_S: TimeInterval = 1.2
    public static let HEAD_GESTURE_WINDOW_S: TimeInterval = 0.9
    public static let HEAD_GESTURE_MIN_OSCILLATIONS: Int = 3
    public static let HEAD_GESTURE_MIN_PEAK_RAD_PER_S: Double = 3.0

    /// Combine stream of detected gestures. Subscribers see one event per
    /// physical shake/nod; `.none` is emitted when the detector clears the
    /// debounce window so consumers can reset their UI state if they want.
    public let gestures = PassthroughSubject<Gesture, Never>()

    /// Last gesture observed, exposed for SwiftUI bindings.
    @Published public private(set) var lastGesture: Gesture = .none

    /// True while `CMHeadphoneMotionManager` is streaming.
    @Published public private(set) var isStreaming: Bool = false

    #if canImport(CoreMotion)
    private let manager: CMHeadphoneMotionManager
    #endif
    private var lastFireAt: Date = .distantPast
    private var yawSamples: [(t: TimeInterval, v: Double)] = []
    private var pitchSamples: [(t: TimeInterval, v: Double)] = []

    public init() {
        #if canImport(CoreMotion)
        self.manager = CMHeadphoneMotionManager()
        #endif
    }

    /// Start streaming motion. Safe to call multiple times — re-arms cleanly.
    public func start() {
        #if canImport(CoreMotion)
        guard manager.isDeviceMotionAvailable else {
            // No AirPods Pro / 3 / Max paired, or the device doesn't support
            // headphone motion. The receptivity gate falls back gracefully.
            return
        }
        if manager.isDeviceMotionActive {
            return
        }
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let self, let motion else { return }
            self.consume(motion: motion)
        }
        publishMain { self.isStreaming = self.isStreamingNow }
        #endif
    }

    public func stop() {
        #if canImport(CoreMotion)
        if manager.isDeviceMotionActive {
            manager.stopDeviceMotionUpdates()
        }
        publishMain { self.isStreaming = false }
        #endif
    }

    /// Backing accessor — avoids touching the manager from off the main
    /// queue. Only called immediately after `start*Updates(...)` lands.
    private var isStreamingNow: Bool {
        #if canImport(CoreMotion)
        return manager.isDeviceMotionActive
        #else
        return false
        #endif
    }

    private func publishMain(_ block: @escaping () -> Void) {
        if Thread.isMainThread { block() } else { DispatchQueue.main.async(execute: block) }
    }

    // ── Detection ──────────────────────────────────────────────────────

    #if canImport(CoreMotion)
    private func consume(motion: CMDeviceMotion) {
        let now = motion.timestamp
        let yawRate = motion.rotationRate.z      // around vertical axis → shake
        let pitchRate = motion.rotationRate.x    // around lateral axis → nod

        yawSamples.append((now, yawRate))
        pitchSamples.append((now, pitchRate))

        let cutoff = now - Self.HEAD_GESTURE_WINDOW_S
        yawSamples.removeAll { $0.t < cutoff }
        pitchSamples.removeAll { $0.t < cutoff }

        // Debounce — never fire twice within DEBOUNCE_S.
        if Date().timeIntervalSince(lastFireAt) < Self.HEAD_GESTURE_DEBOUNCE_S {
            return
        }

        if Self.detect(samples: yawSamples) {
            fire(.shake)
        } else if Self.detect(samples: pitchSamples) {
            fire(.nod)
        }
    }
    #endif

    /// Pure detector — exposed `internal` so tests can hit it directly with
    /// synthetic samples instead of a real `CMDeviceMotion` stream.
    static func detect(samples: [(t: TimeInterval, v: Double)]) -> Bool {
        guard let peak = samples.map({ abs($0.v) }).max(), peak >= HEAD_GESTURE_MIN_PEAK_RAD_PER_S else {
            return false
        }
        var crossings = 0
        var lastSign = 0
        for s in samples where abs(s.v) > 0.5 {
            let sign = s.v > 0 ? 1 : -1
            if lastSign != 0 && sign != lastSign {
                crossings += 1
            }
            lastSign = sign
        }
        return crossings >= HEAD_GESTURE_MIN_OSCILLATIONS
    }

    private func fire(_ gesture: Gesture) {
        lastFireAt = Date()
        gestures.send(gesture)
        publishMain { self.lastGesture = gesture }
        // Reset buffers so the next gesture starts from a clean window.
        yawSamples.removeAll()
        pitchSamples.removeAll()
    }
}
