// Vault.swift — port of packages/shared/src/types/vault.ts.
//
// Encrypted data compartments. The metadata travels as JSON; the
// `encryptedContent` blob stays opaque to the app shell — Wave 2 #15 wires
// up libsodium decryption.

import Foundation

public enum VaultType: String, Codable, Sendable, CaseIterable {
    case identity, finance, health, diary, calendar, secrets, custom
}

public struct Vault: Codable, Sendable, Hashable {
    public let id: String
    public let type: VaultType
    public let name: String
    public let description: String?
    public let defaultPermissionLevel: PermissionLevel
    public let createdAt: Date
    public let updatedAt: Date
    public let isUnlocked: Bool
    public let encryptionMetadata: VaultEncryptionMetadata
}

public struct VaultEncryptionMetadata: Codable, Sendable, Hashable {
    public enum Algorithm: String, Codable, Sendable {
        case argon2id
    }

    public let algorithm: Algorithm
    public let salt: String
    public let memoryCost: Int
    public let timeCost: Int
    public let parallelism: Int
    public let encryptedVaultKey: String
    public let vaultKeyNonce: String
}

public struct VaultItem: Codable, Sendable, Hashable {
    public let id: String
    public let vaultId: String
    public let itemType: String
    public let title: String
    public let permission: Permission?
    public let createdAt: Date
    public let updatedAt: Date
    public let encryptedContent: String
    public let contentNonce: String
    public let tags: [String]?
    public let resourceUri: String
}

/// Generic decrypted view over any item content shape.
public struct DecryptedVaultItem<Content: Codable & Sendable>: Codable, Sendable {
    public let id: String
    public let vaultId: String
    public let itemType: String
    public let title: String
    public let permission: Permission?
    public let createdAt: Date
    public let updatedAt: Date
    public let tags: [String]?
    public let resourceUri: String
    public let content: Content
}

// ── Item content shapes ─────────────────────────────────────────────

public struct TransactionContent: Codable, Sendable, Hashable {
    public enum Kind: String, Codable, Sendable {
        case income, expense, transfer
    }

    public let type: Kind
    public let amount: Double
    public let currency: String
    public let category: String
    public let subcategory: String?
    public let merchant: String?
    public let date: String  // ISO 8601
    public let notes: String?
    public let paymentMethod: String?
    public let recurring: Bool?
}

public struct BillContent: Codable, Sendable, Hashable {
    public enum Status: String, Codable, Sendable {
        case pending, paid, overdue
    }

    public struct PaymentRecord: Codable, Sendable, Hashable {
        public let date: String
        public let amount: Double
    }

    public let provider: String
    public let accountNumber: String?
    public let amount: Double
    public let currency: String
    public let dueDate: String
    public let category: String
    public let status: Status
    public let invoiceNumber: String?
    public let paymentHistory: [PaymentRecord]?
}

public struct HealthRecordContent: Codable, Sendable, Hashable {
    public enum Kind: String, Codable, Sendable {
        case consultation, prescription
        case testResult = "test_result"
        case vaccination, procedure
    }

    public let type: Kind
    public let provider: String
    public let date: String
    public let summary: String
    public let details: String?
    public let attachments: [String]?
}

public struct IdentityDocumentContent: Codable, Sendable, Hashable {
    public enum Kind: String, Codable, Sendable {
        case passport
        case driversLicense = "drivers_license"
        case birthCertificate = "birth_certificate"
        case taxFileNumber = "tax_file_number"
        case medicare, other
    }

    public let type: Kind
    public let documentNumber: String?
    public let issuedBy: String?
    public let issueDate: String?
    public let expiryDate: String?
    public let notes: String?
}

public enum MessagingPlatform: String, Codable, Sendable {
    case signal, whatsapp, telegram, imessage, sms, email, matrix, discord, slack
}

public struct ContactMethod: Codable, Sendable, Hashable {
    public let platform: MessagingPlatform
    public let identifier: String
    public let isPrimary: Bool?
    public let isVerified: Bool?
    public let label: String?
}

public struct ProfileContent: Codable, Sendable, Hashable {
    public struct Address: Codable, Sendable, Hashable {
        public let street: String?
        public let city: String?
        public let state: String?
        public let postalCode: String?
        public let country: String?
    }

    public let displayName: String
    public let email: String?
    public let phone: String?
    public let dateOfBirth: String?
    public let address: Address?
    public let languagePreference: String
    public let timezone: String
    public let contactMethods: [ContactMethod]?
    public let avatarUri: String?
    public let bio: String?
}

public struct DiaryEntryContent: Codable, Sendable, Hashable {
    public let date: String
    public let mood: String?
    public let content: String
    public let tags: [String]?
}

public struct CalendarEventContent: Codable, Sendable, Hashable {
    public struct Reminder: Codable, Sendable, Hashable {
        public enum Kind: String, Codable, Sendable {
            case notification, email
        }
        public let type: Kind
        public let minutesBefore: Int
    }

    public struct Recurrence: Codable, Sendable, Hashable {
        public enum Frequency: String, Codable, Sendable {
            case daily, weekly, monthly, yearly
        }
        public let frequency: Frequency
        public let interval: Int
        public let until: String?
    }

    public let title: String
    public let description: String?
    public let startTime: String
    public let endTime: String
    public let location: String?
    public let attendees: [String]?
    public let reminders: [Reminder]?
    public let recurring: Recurrence?
}

public struct SecretContent: Codable, Sendable, Hashable {
    public enum Kind: String, Codable, Sendable {
        case password
        case apiKey = "api_key"
        case privateKey = "private_key"
        case recoveryPhrase = "recovery_phrase"
        case other
    }

    public let type: Kind
    public let value: String
    public let username: String?
    public let url: String?
    public let notes: String?
    public let lastRotated: String?
}
