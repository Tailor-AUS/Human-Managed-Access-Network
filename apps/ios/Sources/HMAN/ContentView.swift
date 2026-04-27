// ContentView.swift — root tab bar.
//
// Mirrors the navigation chassis of the React member-app dashboard so a
// member can move between Welcome, Onboarding, Dashboard, Gates, Memory,
// and Audit without surprise. All views are placeholders — features
// land in Wave 2 sub-issues.

import SwiftUI

public struct ContentView: View {
    public init() {}

    public var body: some View {
        TabView {
            WelcomeView()
                .tabItem {
                    Label("Welcome", systemImage: "hand.wave")
                }

            OnboardingView()
                .tabItem {
                    Label("Onboard", systemImage: "person.badge.plus")
                }

            DashboardView()
                .tabItem {
                    Label("Home", systemImage: "house")
                }

            GatesView()
                .tabItem {
                    Label("Gates", systemImage: "lock.shield")
                }

            MemoryView()
                .tabItem {
                    Label("Memory", systemImage: "brain")
                }

            AuditView()
                .tabItem {
                    Label("Audit", systemImage: "doc.text.magnifyingglass")
                }
        }
    }
}

#Preview {
    ContentView()
}
