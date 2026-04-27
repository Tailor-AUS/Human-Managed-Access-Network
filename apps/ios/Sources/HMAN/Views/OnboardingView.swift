// OnboardingView.swift — placeholder for the bridge-pair + voice-enrol flow.
//
// Wave 2 #18 (voice biometric) drives the real content here.

import SwiftUI

public struct OnboardingView: View {
    public init() {}

    public var body: some View {
        NavigationStack {
            List {
                Section("Bridge") {
                    Label("Pair with this device", systemImage: "link")
                    Label("Set bearer token", systemImage: "key")
                }
                Section("Voice biometric (Gate 5)") {
                    Label("Enrol your voice", systemImage: "waveform")
                }
                Section {
                    Text("Onboarding flow coming soon — chassis only for now.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Onboarding")
        }
    }
}

#Preview {
    OnboardingView()
}
