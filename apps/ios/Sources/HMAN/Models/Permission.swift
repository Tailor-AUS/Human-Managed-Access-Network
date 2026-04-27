// Permission.swift — port of packages/shared/src/types/permissions.ts.
//
// HMAN Permission Levels (the "Gate" system):
//   0 Open     — auto-shared with any connected AI
//   1 Standard — shared with logging; user notified post-hoc
//   2 Gated    — requires tap-to-approve; push notification
//   3 Locked   — never shared via MCP; manual copy only
//
// `PermissionLevel` is an Int-backed enum to match the TS numeric enum.
// JSON encoding therefore round-trips as a number, which is what the
// FastAPI bridge produces.

import Foundation

public enum PermissionLevel: Int, Codable, Sendable, CaseIterable {
    case open = 0
    case standard = 1
    case gated = 2
    case locked = 3
}

public struct Permission: Codable, Sendable, Hashable {
    public let level: PermissionLevel
    public let description: String
    public let delegatable: Bool
    public let autoApproveConditions: [AutoApproveCondition]?

    public init(
        level: PermissionLevel,
        description: String,
        delegatable: Bool,
        autoApproveConditions: [AutoApproveCondition]? = nil
    ) {
        self.level = level
        self.description = description
        self.delegatable = delegatable
        self.autoApproveConditions = autoApproveConditions
    }
}

/// Discriminated union mirroring the TS condition variants.
/// We keep the `params` as a free-form JSON dict here because the placeholder
/// app never inspects them — the real consumers (Wave 2) will switch on
/// `type` and decode into the matching strongly-typed condition struct below.
public struct AutoApproveCondition: Codable, Sendable, Hashable {
    public enum Kind: String, Codable, Sendable {
        case timeWindow = "time_window"
        case amountLimit = "amount_limit"
        case requesterWhitelist = "requester_whitelist"
        case frequencyLimit = "frequency_limit"
    }

    public let type: Kind
    public let params: JSONValue

    public init(type: Kind, params: JSONValue) {
        self.type = type
        self.params = params
    }
}

public struct TimeWindowCondition: Codable, Sendable, Hashable {
    public let startHour: Int
    public let endHour: Int
    public let daysOfWeek: [Int]
    public let timezone: String
}

public struct AmountLimitCondition: Codable, Sendable, Hashable {
    public enum Period: String, Codable, Sendable {
        case perRequest = "per_request"
        case daily, weekly, monthly
    }
    public let maxAmount: Double
    public let currency: String
    public let period: Period
}

public struct RequesterWhitelistCondition: Codable, Sendable, Hashable {
    public let allowedRequesters: [String]
}

public struct FrequencyLimitCondition: Codable, Sendable, Hashable {
    public enum Period: String, Codable, Sendable {
        case hour, day, week
    }
    public let maxRequests: Int
    public let period: Period
}
