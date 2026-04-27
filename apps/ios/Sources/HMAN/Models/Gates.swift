// Gates.swift — Gate 1..5 status types.
//
// Mirrors the FastAPI bridge `/api/gates` response (see
// packages/python-bridge/api/server.py:572). The TS dashboard uses an
// inline shape; we define explicit Codable structs here so iOS calls
// through `HMANBridgeClient.gatesStatus()` get a typed payload.
//
// Gate 5 (Voice-Bound) has its own status endpoint with richer detail —
// modelled separately as `Gate5Status`.

import Foundation

public struct GateStatus: Codable, Sendable, Hashable, Identifiable {
    /// Stable identity for SwiftUI lists. `name` is unique across the five gates.
    public var id: String { name }

    /// "Light Bulb Moment", "Member Control", "Extension of Thinking",
    /// "Reactive and Non-Invasive", "Voice-Bound to the Member".
    public let name: String
    public let passing: Bool
    public let detail: String
}

public struct GatesResponse: Codable, Sendable, Hashable {
    public let memberId: String
    public let gates: [GateStatus]
    public let lastActivation: String?
    public let rejectionsLastHour: Int

    enum CodingKeys: String, CodingKey {
        case memberId = "member_id"
        case gates
        case lastActivation = "last_activation"
        case rejectionsLastHour = "rejections_last_hour"
    }
}

/// Detailed Gate 5 status — voice-bound runtime state.
public struct Gate5Status: Codable, Sendable, Hashable {
    public struct Event: Codable, Sendable, Hashable {
        public let timestamp: String
        public let accepted: Bool
        public let similarity: Double?
        public let reason: String?
    }

    public let enrolled: Bool
    public let armed: Bool
    public let armedAt: String?
    public let threshold: Double
    public let accepts: Int
    public let rejects: Int
    public let lastActivation: String?
    public let recentEvents: [Event]
}

/// Health probe shape — `GET /api/health`.
public struct BridgeHealth: Codable, Sendable, Hashable {
    public let ok: Bool
    public let version: String
    public let gpu: Bool
    public let enrolled: Bool
}

/// Enrollment session response — `POST /api/enrollment/session`.
public struct EnrollmentSession: Codable, Sendable, Hashable {
    public let sessionId: String
    public let memberId: String
    public let prompts: [String]
    public let currentIndex: Int
    public let total: Int

    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case memberId = "member_id"
        case prompts
        case currentIndex = "current_index"
        case total
    }
}
