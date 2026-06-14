/**
 * @hman/core - Core SDK for Human Managed Access Network
 *
 * This package provides:
 * - Encryption and key management (libsodium-based)
 * - Vault management with tiered permissions
 * - Audit logging with integrity verification
 * - Access control gate for HITL enforcement
 */

// Re-export everything from @hman/shared for convenience
export * from '@hman/shared';

// Crypto module
export {
  initCrypto,
  deriveKeyFromPassphrase,
  generateKey,
  generateNonce,
  encrypt,
  decrypt,
  encryptString,
  decryptString,
  encryptJSON,
  decryptJSON,
  encryptKey,
  decryptKey,
  generateKeyPair,
  encryptForRecipient,
  decryptFromSender,
  hash,
  hashString,
  secureWipe,
  toBase64,
  fromBase64,
  toHex,
  fromHex,
  randomBytes,
  secureCompare,
  DEFAULT_KEY_DERIVATION_CONFIG,
  KeyManager,
  createKeyManager,
  type KeyDerivationConfig,
  type MasterKeyData,
  type VaultKeyData,
  type DelegationKeyMetadata,
} from './crypto/index.js';

// Vault module
export {
  VaultManager,
  MemoryVaultStorage,
  SQLiteVaultStorage,
  type VaultManagerConfig,
  type VaultStorage,
  type ItemQuery,
  type SQLiteStorageConfig,
} from './vault/index.js';

// Audit module
export {
  AuditLogger,
  MemoryAuditStorage,
  SQLiteAuditStorage,
  type AuditStorage,
  type SQLiteAuditStorageConfig,
} from './audit/index.js';

// Access control module
export {
  Gate,
  type GateConfig,
  type GateDecision,
  type AccessRequestHandler,
  type AccessNotificationHandler,
} from './access/index.js';

// Entity module - multi-entity model (PROTOCOL.md § Multi-Entity Model)
export {
  EntityManager,
  EntityError,
  EntityErrorCode,
  MemoryEntityStorage,
  generateEntityKeyPair,
  signDetachedEd25519,
  verifyDetachedEd25519,
  canonicalJsonBytes,
  migrateToMultiEntity,
  type EntityStorage,
  type EntityManagerConfig,
  type CreateEntityInput,
  type UpdateEntityInput,
  type Ed25519KeyPair,
} from './entity/index.js';

// Organisation module — business/collective equivalent (PROTOCOL.md § Organisation Model)
export {
  OrganisationManager,
  OrgError,
  OrgErrorCode,
  MemoryOrganisationStorage,
  tallyVotes,
  isAccepted,
  isDecided,
  outcomeOf,
  VOTE_DECISIONS,
  type OrganisationStorage,
  type OrganisationManagerConfig,
  type CreateOrganisationInput,
  type JoinRequestInput,
  type InviteInput,
  type OpenProposalInput,
  type CastVoteInput,
} from './organisation/index.js';

// Payment rail adapters (PROTOCOL.md § Payment Rail Adapters)
export {
  RailRegistry,
  BainkAdapter,
  StripeAdapter,
  type PaymentRailSelection,
  type BainkAdapterConfig,
  type StripeAdapterConfig,
} from './payment-rails/index.js';

// HMAN SDK - convenient wrapper for common operations
export { HmanSDK, createHmanSDK, type HmanSDKConfig } from './sdk.js';

// E2EE Messaging module
export {
  generateIdentityKeyPair,
  generatePreKey,
  generatePreKeys,
  encryptMessage,
  decryptMessage,
  SessionManager,
  createSessionManager,
  restoreSessionManager,
  MessageStore,
  type IdentityKeyPair,
  type PreKey,
  type SignedPreKey,
  type EncryptedMessage,
  type Session,
  type MessageStoreConfig,
  type StoredMessage,
  // Signal integration
  SignalService,
  createSignalService,
  HmanSignalBridge,
  type SignalMessage,
  type SignalAttachment,
  type SignalConfig,
  type SignalRegistration,
  // Signal CLI Interface
  HmanSignalInterface,
  createSignalInterface,
  type HmanCommand,
  type ParsedCommand,
  type HmanStatus,
  type PendingRequest,
  type VaultSummary,
  type ActivityEntry,
  // APNs push channel (issue #17)
  dispatchToAPNs,
  type DispatchableIntention,
  type PushDispatchResult,
  type PushDispatcherConfig,
} from './messaging/index.js';

// Demo data seeder
export {
  seedDemoData,
  seedIdentity,
  seedFinance,
  seedHealth,
  seedDiary,
  seedCalendar,
  type SeederOptions,
} from './seeder/index.js';

// Delegation module
export {
  DelegationManager,
  MemoryDelegationStorage,
  type DelegationStorage,
  type DelegationManagerConfig,
  type CreateDelegationParams,
} from './delegation/index.js';

// Payments module
export {
  PaymentManager,
  MockPaymentProvider,
  type PaymentProvider,
  type PaymentProviderConfig,
  type PayIDAddress,
  type PaymentRequest,
  type PaymentResult,
  type Transaction,
} from './payments/index.js';

// Bot framework
export {
  BotManager,
  MemoryBotStorage,
  createPaymentRequestMessage,
  createStructuredMessage,
  BOT_TEMPLATES,
  type BotRegistration,
  type BotMessage,
  type BotMessageResponse,
  type BotStorage,
} from './bots/index.js';

// HMAN file format utilities
export {
  createHmanFile,
  parseHmanFile,
  validateHmanFile,
  getHmanFileMetadata,
  isHmanFile,
  getHmanFileExtension,
  getHmanExportFilename,
  HmanFileError,
} from './file/hman-file.js';

// HMAN Service - Signal-based AI broker
export {
  HmanService,
  createHmanService,
  PaymentExecutor,
  BookingExecutor,
  type HmanUser,
  type ConnectedLLM,
  type LLMPermissions,
  type UserPreferences,
  type UserProfile,
  type PaymentMethod,
  type Address,
  type TaskRequest,
  type TaskResponse,
  type ExecutionResult,
  type TaskExecutor,
} from './services/index.js';

// Authenticity module - Proof of Human
export {
  HmanAuthenticity,
  SignatureRegistry,
  demonstrateAuthenticity,
  type HmanSignature,
  type HmanBadge,
  type VerificationResult,
} from './authenticity/index.js';

// Signal Client module - session-based communication with trust levels
export {
  SignalClient as HmanSignalClient,
  createSignalClient as createHmanSignalClient,
  TrustLevel,
  type SignalConfig as HmanSignalClientConfig,
  type User as SignalUser,
  type Connection as HmanConnection,
  type ApprovalRule as HmanApprovalRule,
  type SessionCode as HmanSessionCode,
  type Session as HmanSession,
  type PendingRequest as HmanPendingRequest,
  type RequestResponse as HmanRequestResponse,
  type AuditEntry as HmanAuditEntry,
} from './signal/index.js';

// Bridge module - connects AI to Signal
export {
  HmanBridge,
  createBridge,
  type BridgeConfig,
  type DataRequest,
  type DataResponse,
} from './bridge.js';

// Connectors module - external actions HMAN takes on a member's behalf
// Note: ``ExecutionResult`` and ``GateDecision`` are also exported from
// services/access; we re-export the connector-flavoured ones under
// distinct aliases so callers can reach for either without ambiguity.
export {
  GitHubConnector,
  hashIntention,
  renderAttestationBlock,
  signAttestation,
  parseDraftReply,
  OllamaLLMClient,
  FetchGitHubClient,
  resolveOllamaEndpoint,
  resolveOllamaModel,
  resolveOllamaTimeoutMs,
  type Connector,
  type Intention,
  type ExecutionResult as ConnectorExecutionResult,
  type PACTAttestation,
  type ReceptivityGate,
  type GateDecision as ReceptivityGateDecision,
  type GitHubIssuePayload,
  type GitHubConnectorConfig,
  type LLMClient,
  type GitHubClient,
} from './connectors/index.js';
