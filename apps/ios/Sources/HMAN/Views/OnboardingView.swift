// OnboardingView.swift — bridge-pair + voice-enrol entry point.
//
// Wave 2 #18 wires the voice biometric path into this view via
// `EnrollmentFlow`. The actual recording UI (microphone activation,
// VAD ring, retry copy) lives in a child route the user pushes onto
// the navigation stack from this list.
//
// For the v0 we surface:
//   - "Pair with this device"  → bridge token entry (placeholder)
//   - "Set bearer token"        → manual paste (placeholder)
//   - "Enrol your voice"        → pushes the EnrolmentFlow route
//   - "Status"                  → reflects whether a Keychain
//                                 reference exists for the current
//                                 member, so the user can tell at a
//                                 glance if Gate 5 is armed.

import SwiftUI

public struct OnboardingView: View {
    /// Member identifier used for Keychain lookups. The hardcoded
    /// default mirrors the desktop's `--member-id member` flag — Wave
    /// 2 onboarding swaps this for the value minted during pairing.
    public let memberId: String

    /// Reference store used to surface "is enrolled" state. Default
    /// is the real Keychain-backed store; tests + previews inject
    /// `InMemoryReferenceStore`.
    private let store: ReferenceStore

    @State private var hasReference: Bool

    public init(
        memberId: String = "member",
        store: ReferenceStore = EncryptedReferenceStore()
    ) {
        self.memberId = memberId
        self.store = store
        // SwiftUI requires `_State` initialisation, hence the underscore.
        // `hasReference(memberId:)` is a cheap Keychain probe.
        _hasReference = State(initialValue: store.hasReference(memberId: memberId))
    }

    public var body: some View {
        NavigationStack {
            List {
                Section("Bridge") {
                    Label("Pair with this device", systemImage: "link")
                    Label("Set bearer token", systemImage: "key")
                }
                Section("Voice biometric (Gate 5)") {
                    NavigationLink {
                        EnrollmentRouteView(memberId: memberId, store: store) {
                            // Re-probe on completion so the status row
                            // flips to "enrolled" without a manual
                            // refresh.
                            hasReference = store.hasReference(memberId: memberId)
                        }
                    } label: {
                        Label(hasReference ? "Re-enrol your voice" : "Enrol your voice",
                              systemImage: "waveform")
                    }
                    Label(hasReference ? "Enrolled" : "Not enrolled",
                          systemImage: hasReference ? "checkmark.shield" : "xmark.shield")
                        .foregroundStyle(hasReference ? .green : .secondary)
                }
                Section {
                    Text("On-device only. The reference never leaves this device.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Onboarding")
        }
    }
}

/// Hosting view for the EnrolmentFlow. Owns the `@StateObject` flow so
/// re-renders don't tear it down. The actual record button + VAD ring
/// land in a follow-up PR (issue #18 explicitly scopes this Wave 2
/// sub-issue to the Gate 5 plumbing — UX polish is a separate concern).
private struct EnrollmentRouteView: View {
    let memberId: String
    let store: ReferenceStore
    let onComplete: () -> Void

    @StateObject private var flow: EnrollmentFlow

    init(memberId: String, store: ReferenceStore, onComplete: @escaping () -> Void) {
        self.memberId = memberId
        self.store = store
        self.onComplete = onComplete
        _flow = StateObject(wrappedValue: EnrollmentFlow(memberId: memberId, store: store))
    }

    var body: some View {
        Form {
            switch flow.stage {
            case let .recording(index, prompt):
                Section("Prompt \(index + 1) of \(flow.promptCount)") {
                    Text(prompt)
                        .font(.body)
                    if let audit = flow.lastAudit {
                        Text(audit.reason)
                            .font(.footnote)
                            .foregroundStyle(audit.ok ? .secondary : .red)
                    }
                    Text("Recording UI lands in a follow-up. For now this view exposes the flow object; the AVAudioRecorder bridge calls submitSample(_:) on the flow.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section {
                    ProgressView(value: Double(flow.collectedCount), total: Double(flow.promptCount))
                }
            case let .complete(_, samplesUsed):
                Section {
                    Label("Enrolled — \(samplesUsed) samples used", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
            case let .failed(reason):
                Section {
                    Label(reason, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                    Button("Start over", action: flow.reset)
                }
            }
        }
        .navigationTitle("Voice enrolment")
        .onChange(of: flow.stage) { _, new in
            if case .complete = new { onComplete() }
        }
    }
}

#Preview {
    OnboardingView(memberId: "preview", store: InMemoryReferenceStore())
}
