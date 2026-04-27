// MemoryView.swift — subconscious / memory placeholder.
//
// Will eventually show recent ambient transcript, topic timeline, and
// knowledge-graph slices once the iOS sensors story is in flight.

import SwiftUI

public struct MemoryView: View {
    public init() {}

    public var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                Image(systemName: "brain")
                    .font(.system(size: 48))
                    .foregroundStyle(.tint)
                Text("Memory — coming soon")
                    .font(.headline)
                Text("Topic timeline, recent transcript, and knowledge graph land in later Wave 2 issues.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            .padding()
            .navigationTitle("Memory")
        }
    }
}

#Preview {
    MemoryView()
}
