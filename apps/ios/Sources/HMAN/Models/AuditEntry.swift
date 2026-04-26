// AuditEntry.swift — port of packages/shared/src/types/audit.ts.
//
// All access is logged locally with a hash chain. This file ports the
// log-entry shape, query filters, and summary aggregate.

import Foundation

public struct AuditLogEntry: Codable, Sendable, Hashable {
    public let id: String
    public let timestamp: Date
    public let action: AuditAction
    public let actor: AuditActor
    public let resource: AuditResource
    public let outcome: AuditOutcome
    public let metadata: JSONValue?
    public let previousEntryHash: String?
    public let entryHash: String
}

public enum AuditAction: String, Codable, Sendable, CaseIterable {
    case accessRequest = "access_request"
    case accessGranted = "access_granted"
    case accessDenied = "access_denied"
    case dataRead = "data_read"
    case dataWrite = "data_write"
    case dataDelete = "data_delete"
    case vaultUnlock = "vault_unlock"
    case vaultLock = "vault_lock"
    case delegationCreated = "delegation_created"
    case delegationAccepted = "delegation_accepted"
    case delegationRevoked = "delegation_revoked"
    case delegationExpired = "delegation_expired"
    case paymentRequested = "payment_requested"
    case paymentApproved = "payment_approved"
    case paymentDenied = "payment_denied"
    case paymentExecuted = "payment_executed"
    case exportRequested = "export_requested"
    case exportCompleted = "export_completed"
    case permissionChanged = "permission_changed"
    case keyRotation = "key_rotation"
}

public struct AuditActor: Codable, Sendable, Hashable {
    public enum Kind: String, Codable, Sendable {
        case user
        case aiModel = "ai_model"
        case delegate, bot, system
    }

    public let type: Kind
    public let id: String
    public let name: String
    public let modelId: String?
    public let deviceInfo: String?
}

public struct AuditResource: Codable, Sendable, Hashable {
    public let uri: String
    public let vaultId: String
    public let itemId: String?
    public let permissionLevel: PermissionLevel
    public let description: String?
}

public struct AuditOutcome: Codable, Sendable, Hashable {
    public enum ApprovalMethod: String, Codable, Sendable {
        case auto
        case userApproved = "user_approved"
        case delegateApproved = "delegate_approved"
        case preAuthorized = "pre_authorized"
    }

    public let success: Bool
    public let failureReason: String?
    public let approvalMethod: ApprovalMethod?
    public let accessDuration: String?
}

public struct AuditQuery: Codable, Sendable, Hashable {
    public enum SortOrder: String, Codable, Sendable {
        case asc, desc
    }

    public let startTime: Date?
    public let endTime: Date?
    public let actions: [AuditAction]?
    public let actorId: String?
    public let actorType: AuditActor.Kind?
    public let vaultId: String?
    public let resourceUri: String?
    public let successOnly: Bool?
    public let failureOnly: Bool?
    public let limit: Int?
    public let offset: Int?
    public let sortOrder: SortOrder?

    public init(
        startTime: Date? = nil,
        endTime: Date? = nil,
        actions: [AuditAction]? = nil,
        actorId: String? = nil,
        actorType: AuditActor.Kind? = nil,
        vaultId: String? = nil,
        resourceUri: String? = nil,
        successOnly: Bool? = nil,
        failureOnly: Bool? = nil,
        limit: Int? = nil,
        offset: Int? = nil,
        sortOrder: SortOrder? = nil
    ) {
        self.startTime = startTime
        self.endTime = endTime
        self.actions = actions
        self.actorId = actorId
        self.actorType = actorType
        self.vaultId = vaultId
        self.resourceUri = resourceUri
        self.successOnly = successOnly
        self.failureOnly = failureOnly
        self.limit = limit
        self.offset = offset
        self.sortOrder = sortOrder
    }
}

public struct AuditSummary: Codable, Sendable, Hashable {
    public struct ResourceCount: Codable, Sendable, Hashable {
        public let uri: String
        public let accessCount: Int
    }

    public struct ActorCount: Codable, Sendable, Hashable {
        public let id: String
        public let name: String
        public let actionCount: Int
    }

    public let startTime: Date
    public let endTime: Date
    public let totalActions: Int
    public let actionCounts: [String: Int]
    public let actorTypeCounts: [String: Int]
    public let successCount: Int
    public let failureCount: Int
    public let topResources: [ResourceCount]
    public let topActors: [ActorCount]
}
