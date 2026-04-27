// AuditView.swift — audit log placeholder.
//
// Real implementation tails the bridge's audit endpoint and renders
// `AuditLogEntry` rows with hash-chain badges.

import SwiftUI

public struct AuditView: View {
    public init() {}

    public var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Audit log — coming soon")
                        .foregroundStyle(.secondary)
                }
                Section("Filters") {
                    Label("By actor", systemImage: "person")
                    Label("By action", systemImage: "list.bullet")
                    Label("By time", systemImage: "clock")
                }
            }
            .navigationTitle("Audit")
        }
    }
}

#Preview {
    AuditView()
}
