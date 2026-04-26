// Push.swift — APNs registration & intention-decision response types.
//
// Mirrors the FastAPI bridge surfaces in
// `packages/python-bridge/api/push.py` (issue #17). Wire format is
// snake_case; the bridge client's shared decoder converts to camelCase,
// but where a payload field is itself an enum value we declare explicit
// `CodingKeys` / raw values so the round-trip is unambiguous.

import Foundation

/// `POST /api/push/register` response.
public struct PushRegisterResponse: Codable, Sendable, Hashable {
    public let stored: Bool
    public let memberId: String
    /// ISO-8601 timestamp the bridge wrote the token at (server clock).
    public let registeredAt: String

    enum CodingKeys: String, CodingKey {
        case stored
        case memberId = "member_id"
        case registeredAt = "registered_at"
    }
}

/// Member's verdict on a receptivity-gate intention prompt.
public enum IntentionDecision: String, Codable, Sendable {
    case approve
    case deny
}

/// Which channel surfaced the intention. The bridge records this so we
/// can report on per-channel approval rates and tune the gate over time.
public enum IntentionDecisionChannel: String, Codable, Sendable {
    case apns
    case signal
    case voice
}

/// `POST /api/intentions/{id}/decide` response.
public struct IntentionDecisionResponse: Codable, Sendable, Hashable {
    public let intentionId: String
    public let decision: IntentionDecision
    public let channel: IntentionDecisionChannel
    public let recordedAt: String

    enum CodingKeys: String, CodingKey {
        case intentionId = "intention_id"
        case decision
        case channel
        case recordedAt = "recorded_at"
    }
}
