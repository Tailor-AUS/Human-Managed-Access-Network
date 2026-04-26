// AirPodsPresence.swift — in-ear / headphones-route signal for the receptivity gate.
//
// AirPods (and most BT headphones with a microphone) advertise themselves as a
// new audio route on `AVAudioSession.sharedInstance().currentRoute`. We don't
// get a true "in-ear" boolean from CoreBluetooth without MFi entitlements, so
// we infer it: if the *current input* is an AirPods/BT-HFP route OR the
// *current output* is an AirPods/headphones route, treat as `inEar`.
//
// This is intentionally conservative — false positives (BT speaker counted as
// "headphones") are fine for the receptivity gate; the gate composes this with
// motion + ambient RMS before deciding to surface anything.
//
// Wire-up: `RECEPTIVITY_INPUTS` owns the singleton; SwiftUI views observe via
// `@EnvironmentObject`. The publisher fires on `AVAudioSession.routeChangeNotification`
// — the same notification iOS posts when AirPods are taken out of the ear (the
// system pauses media; the route change reports the previous route).

import Foundation
import Combine
#if canImport(AVFoundation)
import AVFoundation
#endif

public final class AirPodsPresence: ObservableObject, @unchecked Sendable {
    /// True when the audio session's current route looks like in-ear / on-ear
    /// headphones (wired or BT). Inferred — see file header.
    @Published public private(set) var inEar: Bool = false

    /// True when *any* headphone-shaped route is active, even if we can't be
    /// sure about in-ear vs over-ear (e.g. AirPods Max). Useful for the
    /// receptivity gate's coarser checks.
    @Published public private(set) var headphonesActive: Bool = false

    /// Human-readable description of the current route, for debug surfaces and
    /// the audit log. Format: `"<port-name> (<port-type>)"` joined by `" + "`.
    @Published public private(set) var routeDescription: String = ""

    private var cancellables: Set<AnyCancellable> = []

    public init() {
        #if canImport(AVFoundation) && !os(macOS)
        // Initial snapshot — covers the case where AirPods were already
        // connected when the app launched.
        refresh()

        // `routeChangeNotification` is delivered on whichever queue posted
        // the notification (typically a system audio queue). We force-hop
        // to `RunLoop.main` so `@Published` mutations stay on the main
        // thread.
        NotificationCenter.default
            .publisher(for: AVAudioSession.routeChangeNotification)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.refresh() }
            .store(in: &cancellables)
        #endif
    }

    /// Force a re-read. Tests use this; production code triggers via the
    /// notification subscription.
    public func refresh() {
        #if canImport(AVFoundation) && !os(macOS)
        let route = AVAudioSession.sharedInstance().currentRoute
        let outputs = route.outputs
        let inputs = route.inputs

        let outputHeadphones = outputs.contains { Self.isHeadphoneLike($0.portType) }
        let inputHeadphones = inputs.contains { Self.isHeadphoneLike($0.portType) }

        self.headphonesActive = outputHeadphones || inputHeadphones
        // We treat any headphone route as in-ear-equivalent for gating.
        // A future refinement: parse `AVAudioSession.outputDataSource` /
        // CoreBluetooth descriptors to disambiguate AirPods Max (on-ear)
        // vs Pro/3 (in-ear). Not needed for the current gate.
        self.inEar = self.headphonesActive

        let descriptors = outputs.map { "\($0.portName) (\($0.portType.rawValue))" }
            + inputs.map { "in:\($0.portName) (\($0.portType.rawValue))" }
        self.routeDescription = descriptors.joined(separator: " + ")
        #else
        // Non-iOS host (tests on macOS / Linux): keep current values.
        #endif
    }

    #if canImport(AVFoundation) && !os(macOS)
    /// Port types we count as "headphones-like". Kept narrow on purpose —
    /// e.g. CarPlay / built-in mic explicitly *don't* qualify.
    private static func isHeadphoneLike(_ port: AVAudioSession.Port) -> Bool {
        switch port {
        case .headphones,           // wired
             .bluetoothA2DP,        // most BT music output (AirPods media)
             .bluetoothHFP,         // BT call profile (AirPods mic)
             .bluetoothLE,          // BT-LE audio
             .airPlay,              // AirPlay-routed
             .usbAudio:             // wired USB-C 'pods
            return true
        default:
            return false
        }
    }
    #endif
}
