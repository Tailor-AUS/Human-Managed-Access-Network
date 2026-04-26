// HMANApp.swift — SwiftUI entry point.
//
// The app is a thin shell: a tab bar wrapping the placeholder views that
// mirror the React member-app routes. Real logic comes in Wave 2 sub-issues
// (#14 motion, #15 PACT, #16 HealthKit, #17 APNs, #18 voice biometric).

import SwiftUI

@main
public struct HMANApp: App {
    public init() {}

    public var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
