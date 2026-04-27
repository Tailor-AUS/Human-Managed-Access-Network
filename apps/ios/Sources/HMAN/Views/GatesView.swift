// GatesView.swift — Gate 1..5 status placeholder.
//
// Mirrors the React member-app /gates route. Real content fetches via
// `HMANBridgeClient.gatesStatus()`; the chassis just lists the names.

import SwiftUI

public struct GatesView: View {
    public init() {}

    private static let placeholderGates: [String] = [
        "Light Bulb Moment",
        "Member Control",
        "Extension of Thinking",
        "Reactive and Non-Invasive",
        "Voice-Bound to the Member",
    ]

    public var body: some View {
        NavigationStack {
            List(Self.placeholderGates, id: \.self) { name in
                HStack {
                    Image(systemName: "lock.shield")
                        .foregroundStyle(.secondary)
                    Text(name)
                    Spacer()
                    Text("—")
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Gates")
        }
    }
}

#Preview {
    GatesView()
}
