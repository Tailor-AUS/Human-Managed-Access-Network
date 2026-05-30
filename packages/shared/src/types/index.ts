// Permission types
export {
  PermissionLevel,
  type Permission,
  type AutoApproveCondition,
  type TimeWindowCondition,
  type AmountLimitCondition,
  type RequesterWhitelistCondition,
  type FrequencyLimitCondition,
  type PermissionCondition,
} from './permissions.js';

// Vault types
export {
  VaultType,
  type Vault,
  type VaultEncryptionMetadata,
  type VaultItem,
  type DecryptedVaultItem,
  type TransactionContent,
  type BillContent,
  type HealthRecordContent,
  type IdentityDocumentContent,
  type MessagingPlatform,
  type ContactMethod,
  type ProfileContent,
  type DiaryEntryContent,
  type CalendarEventContent,
  type SecretContent,
} from './vault.js';

// Access types
export {
  type AccessRequest,
  type AccessRequestStatus,
  type RequesterInfo,
  type ResourceInfo,
  type AccessResponse,
  type Delegation,
  type DelegationStatus,
  type DelegateInfo,
  type DelegatedPermission,
  type DelegatedAction,
  type DelegationCondition,
  type AmountLimitDelegationCondition,
  type TimeWindowDelegationCondition,
  type RequireNotificationCondition,
} from './access.js';

// Audit types
export {
  type AuditLogEntry,
  type AuditAction,
  type AuditActor,
  type AuditResource,
  type AuditOutcome,
  type AuditQuery,
  type AuditSummary,
} from './audit.js';

// Entity types (multi-entity model — PROTOCOL.md § Multi-Entity Model)
export {
  EntityStatus,
  ReceptivityChannel,
  DEFAULT_RECEPTIVITY_POLICY,
  DEFAULT_PERSONAL_ENTITY_NAME,
  type Entity,
  type EntityId,
  type MemberId,
  type EntityKeyData,
  type PaymentRailNomination,
  type PayIDNomination,
  type OskoNomination,
  type BPayNomination,
  type StripeNomination,
  type VaultScope,
  type ReceptivityPolicy,
  type ReceptivityRule,
  type ReceptivityCondition,
  type OfferAmountCondition,
  type CounterpartyTrustCondition,
  type TimeOfDayCondition,
  type EntityActiveCondition,
  type CognitiveLoadOverride,
} from './entity.js';

// Organisation model (PROTOCOL.md § Organisation Model)
export {
  OrgKind,
  OrgStatus,
  OrgRole,
  MembershipStatus,
  AdmissionRule,
  ProposalKind,
  ProposalStatus,
  DEFAULT_ORG_GOVERNANCE,
  type OrganisationId,
  type MembershipId,
  type ProposalId,
  type OrgGovernancePolicy,
  type Organisation,
  type OrgKeyData,
  type OrgMembership,
  type OrgJoinAttestation,
  type PactProposal,
  type PactVote,
  type PactTally,
  type PactConsensusRecord,
  type VoteDecision,
  type OrgAuditEvent,
} from './organisation.js';

// Payment Rail Adapter protocol (PROTOCOL.md § Payment Rail Adapters)
export {
  type Money,
  type RailDescription,
  type SettlementIntent,
  type SettlementEvent,
  type SettlementSubmittedEvent,
  type SettlementStatusUpdateEvent,
  type SettlementSettledEvent,
  type SettlementFailedEvent,
  type SettlementProof,
  type VerifyResult,
  type PaymentRailAdapter,
} from './payment-rail.js';

// Messaging types
export {
  type Message,
  type MessageType,
  type MessageParticipant,
  type TextMessageContent,
  type StructuredMessageContent,
  type PaymentRequestContent,
  type PaymentConfirmationContent,
  type DelegationInviteContent,
  type DelegationResponseContent,
  type AccessNotificationContent,
  type MessageAction,
  type DecryptedMessageContent,
  type Conversation,
  type BotInfo,
} from './messaging.js';

// MCP types
export {
  type HmanResourceUri,
  parseHmanUri,
  buildHmanUri,
  type HmanResourceDefinition,
  DEFAULT_RESOURCES,
  type HmanToolDefinition,
  DEFAULT_TOOLS,
} from './mcp.js';

// HMAN file format types
export {
  HMAN_FILE_MAGIC,
  HMAN_FILE_VERSION,
  HMAN_FILE_EXTENSION,
  HmanFileType,
  HmanEncryption,
  HmanCompression,
  HmanFileFlags,
  HmanValidationErrorCode,
  type HmanFileHeader,
  type HmanVaultExportPayload,
  type HmanExportedItem,
  type HmanFullBackupPayload,
  type HmanExportedDelegation,
  type HmanExportedAuditEntry,
  type HmanFile,
  type HmanFileOptions,
  type HmanFileValidation,
  type HmanValidationError,
  type HmanValidationWarning,
} from './hman-file.js';
