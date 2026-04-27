// AirPodsPresenceTests.swift — sensor-layer tests.
//
// Most of the AirPods/route-change behaviour is hardware-dependent and only
// reproducible on a real device. This file covers what we *can* verify in CI
// (publishers wired up correctly, gesture detector pure logic, ring buffer
// semantics) and documents the manual matrix for the rest.
//
// Manual test plan — run on a device with AirPods Pro (or 3, or Max) before
// merging into a release branch:
//
//   1. Lock phone, walk for 30+ minutes with AirPods in.
//      Expect: `AmbientAudio.isCapturing` stays true, `rms` keeps updating
//      in the debug overlay (visible after unlock), no crash on resume.
//
//   2. Take one AirPod out mid-session.
//      Expect: a `routeChange` notification, `inEar` flips false within ~1s,
//      then back to true when reseated.
//
//   3. With AirPods in, shake head left-right sharply 3+ times.
//      Expect: `gestures` subject emits `.shake` once (not twice).
//      Repeat with vertical nod — expect `.nod`.
//
//   4. Background the app, leave it for >5 minutes, foreground.
//      Expect: ambient buffer still has fresh samples (`lastWindow(seconds: 5)`
//      returns non-zero count); no microphone-permission re-prompt.
//
// Anything failing → file a follow-up issue with the logs from the debug
// view, don't block the PR on a flake.

import XCTest
import Combine
@testable import HMAN

final class AirPodsPresenceTests: XCTestCase {
    func testInitialPublishersAreReadable() {
        let presence = AirPodsPresence()
        // We can't assert the boolean value (depends on the host's audio
        // route, which is non-deterministic in CI). We *can* assert the
        // publisher fires synchronously on subscription, which proves the
        // wiring isn't broken.
        var observedInEar: Bool?
        var observedHeadphones: Bool?
        let c1 = presence.$inEar.sink { observedInEar = $0 }
        let c2 = presence.$headphonesActive.sink { observedHeadphones = $0 }
        XCTAssertNotNil(observedInEar)
        XCTAssertNotNil(observedHeadphones)
        XCTAssertEqual(observedInEar, presence.inEar)
        XCTAssertEqual(observedHeadphones, presence.headphonesActive)
        c1.cancel(); c2.cancel()
    }

    func testRefreshIsIdempotent() {
        let presence = AirPodsPresence()
        let before = presence.routeDescription
        presence.refresh()
        presence.refresh()
        let after = presence.routeDescription
        // Either both empty (no host audio) or stably equal — never partially
        // populated between calls.
        XCTAssertEqual(before, after)
    }
}

final class HeadGestureDetectorTests: XCTestCase {
    /// Synthetic shake: alternating-sign yaw rate at well above the peak
    /// threshold. Should be detected.
    func testDetectFiresOnRapidOscillation() {
        let now: TimeInterval = 0
        var samples: [(t: TimeInterval, v: Double)] = []
        // 12 samples, alternating ±5 rad/s — clear oscillation, well above
        // the 3 rad/s peak threshold.
        for i in 0..<12 {
            let v: Double = (i.isMultiple(of: 2) ? 5.0 : -5.0)
            samples.append((now + Double(i) * 0.05, v))
        }
        XCTAssertTrue(HeadGestureDetector.detect(samples: samples))
    }

    /// Synthetic stillness: all near-zero samples → must not fire.
    func testDetectIgnoresStillness() {
        let samples: [(t: TimeInterval, v: Double)] = (0..<20).map {
            ($0.timeIntervalForTest, 0.05)
        }
        XCTAssertFalse(HeadGestureDetector.detect(samples: samples))
    }

    /// Synthetic single push: large but unidirectional. No oscillation → no
    /// gesture (avoids false-firing on reaching for the phone).
    func testDetectIgnoresUnidirectionalMotion() {
        let samples: [(t: TimeInterval, v: Double)] = (0..<10).map {
            ($0.timeIntervalForTest, 6.0)
        }
        XCTAssertFalse(HeadGestureDetector.detect(samples: samples))
    }
}

final class AmbientAudioRingBufferTests: XCTestCase {
    func testRingBufferWrapsAndPreservesOrder() {
        var rb = RingBuffer<Float>(capacity: 4, fill: 0)
        rb.append(1)
        rb.append(2)
        rb.append(3)
        rb.append(4)
        rb.append(5) // overwrites 1
        XCTAssertEqual(rb.suffix(4), [2, 3, 4, 5])
        XCTAssertEqual(rb.suffix(2), [4, 5])
        XCTAssertEqual(rb.count, 4)
    }

    func testRingBufferShortReadDoesNotCrash() {
        var rb = RingBuffer<Float>(capacity: 4, fill: 0)
        rb.append(1)
        rb.append(2)
        XCTAssertEqual(rb.suffix(10), [1, 2])
        XCTAssertEqual(rb.suffix(0), [])
    }
}

final class ReceptivityInputsTests: XCTestCase {
    func testGesturePropagatesToAggregator() {
        let inputs = ReceptivityInputs()
        XCTAssertNil(inputs.lastHeadGesture)
        // Manually push a gesture through the detector's subject; this is
        // the same path the real motion callback takes.
        inputs.gestures.gestures.send(.shake)
        // Combine `RunLoop.main` delivery — drain a tick.
        let exp = expectation(description: "gesture delivered")
        DispatchQueue.main.async {
            XCTAssertEqual(inputs.lastHeadGesture, .shake)
            exp.fulfill()
        }
        wait(for: [exp], timeout: 1.0)
    }

    func testMotionStateUpdate() {
        let inputs = ReceptivityInputs()
        XCTAssertEqual(inputs.motionState, .unknown)
        inputs.updateMotionState(.walking)
        XCTAssertEqual(inputs.motionState, .walking)
    }
}

private extension Int {
    /// Spaced-by-50ms timestamp for the synthetic-sample tests.
    var timeIntervalForTest: TimeInterval { Double(self) * 0.05 }
}
