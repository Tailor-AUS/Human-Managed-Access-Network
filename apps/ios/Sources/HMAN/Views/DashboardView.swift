// DashboardView.swift — home tab placeholder.
//
// Will surface live bridge health, gate state, and pending access requests
// once Wave 2 #17 (APNs) and the real bridge integration land.

import SwiftUI

public struct DashboardView: View {
    public init() {}

    public var body: some View {
        NavigationStack {
            List {
                Section("Status") {
                    Label("Bridge: unknown", systemImage: "circle.dashed")
                    Label("Gates: not loaded", systemImage: "circle.dashed")
                }
                Section("Pending requests") {
                    Text("None — coming soon")
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Dashboard")
        }
    }
}

#Preview {
    DashboardView()
}
