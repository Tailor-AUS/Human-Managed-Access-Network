/**
 * Entity — a scoped persona under a single member (root identity).
 *
 * A member may run multiple entities concurrently: "Personal", "Trade",
 * "Household", "Creative" etc. Each entity has:
 *   - its own Ed25519 signing keypair
 *   - its own nominated payment rails
 *   - its own vault scope
 *   - its own receptivity policy
 *   - its own audit stream
 *
 * Full spec: PROTOCOL.md — Multi-Entity Model.
 */

export type EntityId = string;
export type MemberId = string;

export enum EntityStatus {
  Active = 'active',
  Suspended = 'suspended',
  Archived = 'archived',
}

/**
 * A payment rail nomination describes how this entity wants to receive
 * (or send from) money via a particular rail. Concrete adapter impls
 * land in Phase 3.
 */
export type PaymentRailNomination =
  | PayIDNomination
  | OskoNomination
  | BPayNomination
  | StripeNomination;

export interface PayIDNomination {
  rail: 'payid';
  alias: string;             // phone "+61..." / email / ABN
  aliasType: 'phone' | 'email' | 'abn' | 'org';
  displayName?: string;
}

export interface OskoNomination {
  rail: 'osko';
  bsb: string;               // 6 digits
  accountNumber: string;     // 6–10 digits
  accountName: string;
}

export interface BPayNomination {
  rail: 'bpay';
  billerCode: string;
  customerReferenceNumber?: string;
}

export interface StripeNomination {
  rail: 'stripe';
  // One of these (not both). Customer id for inbound, account id for outbound.
  customerId?: string;
  connectedAccountId?: string;
  // Card/Apple Pay/Google Pay fallbacks happen via Stripe, so no extra fields.
}

/**
 * Vault scope — which vaults the entity owns / is authorised to access.
 * Scope is intentionally a list of vault IDs (explicit) plus an optional
 * set of vault-type filters. Enforcement is at the access-gate level.
 */
export interface VaultScope {
  /** Specific vault IDs belonging to this entity. */
  vaultIds: string[];
  /**
   * Optional type-based inclusion. If present, vaults of these types
   * belong to this entity even if not yet listed in vaultIds (useful
   * during migration before IDs are stable).
   */
  includeTypes?: string[];
}

/**
 * Receptivity — how signals reach the member through this entity.
 * Spec: PROTOCOL.md — Receptivity Channels.
 */
export enum ReceptivityChannel {
  Silent = 'silent',
  Ambient = 'ambient',
  Whisper = 'whisper',
  Haptic = 'haptic',
  Confirm = 'confirm',
  Interrupt = 'interrupt',
}

export type ReceptivityCondition =
  | OfferAmountCondition
  | CounterpartyTrustCondition
  | TimeOfDayCondition
  | EntityActiveCondition;

export interface OfferAmountCondition {
  kind: 'offer_amount';
  op: 'lt' | 'lte' | 'gt' | 'gte' | 'eq';
  value: number;
  currency: string;
}

export interface CounterpartyTrustCondition {
  kind: 'counterparty_trust';
  /** Match if counterparty hman_id is in this list. */
  trusted_hman_ids: string[];
}

export interface TimeOfDayCondition {
  kind: 'time_of_day';
  /** Local timezone range, inclusive start, exclusive end. HH:MM 24h. */
  start: string;
  end: string;
}

export interface EntityActiveCondition {
  kind: 'entity_active';
  entity_id: EntityId;
}

export interface ReceptivityRule {
  condition: ReceptivityCondition;
  channel: ReceptivityChannel;
  rationale?: string;
}

export interface CognitiveLoadOverride {
  signal_source: 'eeg' | 'hrv' | 'fusion';
  /** Downgrade target when focus signal passes threshold. */
  high_load_channel: ReceptivityChannel;
  /** Source-specific threshold (e.g. HRV RMSSD, EEG beta/alpha ratio). */
  threshold: number;
}

export interface ReceptivityPolicy {
  default_channel: ReceptivityChannel;
  rules: ReceptivityRule[];
  cognitive_load_override?: CognitiveLoadOverride;
}

/**
 * Canonical Entity record.
 *
 * The root identity key for the member lives with the key manager.
 * Each entity has its own Ed25519 signing keypair — public here,
 * private persisted separately (encrypted with master key).
 */
export interface Entity {
  /** UUID */
  id: EntityId;
  /** Root member identity this entity belongs to. */
  member_id: MemberId;
  /** Human-readable name (e.g. "Personal", "Trade", "Hart Household"). */
  display_name: string;
  /** ISO 8601 timestamp of creation. */
  created_at: string;
  /** ISO 8601 timestamp of last update. */
  updated_at: string;
  /** Ed25519 public key (base64). */
  key_pub: string;
  /** Payment rails nominated by this entity. Order = preference. */
  nominated_rails: PaymentRailNomination[];
  /** Which vaults belong to this entity. */
  vault_scope: VaultScope;
  /** How signals reach the member via this entity. */
  receptivity_policy: ReceptivityPolicy;
  /** Lifecycle status. */
  status: EntityStatus;
}

/**
 * Encrypted signing key material for an entity. Mirrors VaultKeyData.
 * The private Ed25519 key is encrypted with the member's master key.
 */
export interface EntityKeyData {
  entity_id: EntityId;
  /** Base64 Ed25519 public key. */
  public_key: string;
  /** Base64 encrypted Ed25519 secret key. */
  encrypted_secret_key: string;
  /** Base64 nonce used when encrypting the secret key. */
  nonce: string;
  /** ISO 8601. */
  created_at: string;
}

/**
 * Sensible default receptivity policy for a freshly created entity:
 * every interaction requires a live confirmation, nothing is silent,
 * nothing is auto-interrupt. Callers adjust after onboarding.
 */
export const DEFAULT_RECEPTIVITY_POLICY: ReceptivityPolicy = {
  default_channel: ReceptivityChannel.Confirm,
  rules: [],
};

/**
 * Conventional display name for the auto-created entity that wraps a
 * newly initialised member's default vaults.
 */
export const DEFAULT_PERSONAL_ENTITY_NAME = 'Personal';
