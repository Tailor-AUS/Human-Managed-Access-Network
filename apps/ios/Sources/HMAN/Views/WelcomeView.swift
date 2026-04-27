// WelcomeView.swift — first-run placeholder.
//
// Real welcome flow lands in a Wave 2 sub-issue. For now the chassis just
// proves the navigation works.

import SwiftUI

public struct WelcomeView: View {
    public init() {}

    public var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: "hand.wave.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(.tint)
                Text("Welcome to HMAN")
                    .font(.title)
                    .bold()
                Text("Your subconscious in your pocket — coming soon.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            .padding()
            .navigationTitle("Welcome")
        }
    }
}

#Preview {
    WelcomeView()
}
