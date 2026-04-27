// AccessRequest.swift — port of packages/shared/src/types/access.ts.
//
// AI/agent access requests, the response a member sends back, and the
// delegation flow for granting scoped access to another HMAN member.

import Foundation

public struct AccessRequest: Codable, Sendable, Hashable {
    public let id: String
    public let requester: RequesterInfo
    public let resource: ResourceInfo
    public let purpose: String
    public let timestamp: Date
    public let status: AccessRequestStatus
    public let expiresAt: Date
    public let approvalExpiresAt: Date?
    public let response: AccessResponse?
}

public enum AccessRequestStatus: String, Codable, Sendable {
    case pending, approved, denied, expired, cancelled
}

public struct RequesterInfo: Codable, Sendable, Hashable {
    public enum Kind: String, Codable, Sendable {
        case aiModel = "ai_model"
        case bot, delegate, application
    }

    public let id: String
    public let type: Kind
    public let name: String
    public let metadata: JSONValue?
}

public struct ResourceInfo: Codable, Sendable, Hashable {
    public let uri: String
    public let name: String
    public let vaultId: String
    public let permissionLevel: PermissionLevel
    public let description: String?
}

public struct AccessResponse: Codable, Sendable, Hashable {
    public enum Decision: String, Codable, Sendable {
        case allowOnce = "allow_once"
        case allowTimed = "allow_timed"
        case allowSession = "allow_session"
        case deny
        case denyAlways = "deny_always"
    }

    public let decision: Decision
    public let respondedBy: String
    public let respondedAt: Date
    public let expiresAt: Date?
    public let reason: String?
}

// ── Delegation ──────────────────────────────────────────────────────

public struct Delegation: Codable, Sendable, Hashable {
    public let id: String
    public let grantor: String
    public let delegate: DelegateInfo
    public let vaultIds: [String]
    public let permissions: [DelegatedPermission]
    public let conditions: [DelegationCondition]?
    public let createdAt: Date
    public let expiresAt: Date
    public let status: DelegationStatus
    public let acceptedAt: Date?
    public let revokedAt: Date?
    public let revocationReason: String?
}

public enum DelegationStatus: String, Codable, Sendable {
    case pending, active, expired, revoked
}

public struct DelegateInfo: Codable, Sendable, Hashable {
    public let id: String
    public let displayName: String
    public let handle: String
    public let publicKey: String
}

public struct DelegatedPermission: Codable, Sendable, Hashable {
    public let resourcePattern: String
    public let actions: [DelegatedAction]
    public let maxApprovalLevel: PermissionLevel
}

public enum DelegatedAction: String, Codable, Sendable {
    case view
    case approvePayment = "approve_payment"
    case respondToRequest = "respond_to_request"
    case export
}

public struct DelegationCondition: Codable, Sendable, Hashable {
    public enum Kind: String, Codable, Sendable {
        case amountLimit = "amount_limit"
        case timeWindow = "time_window"
        case requireNotification = "require_notification"
    }

    public let type: Kind
    public let params: JSONValue
}
