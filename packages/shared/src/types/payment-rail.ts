/**
 * Payment Rail Adapter protocol — runtime types.
 *
 * Each payment rail (baink/PayID, Stripe, OSKO, BPay, ...) implements the
 * PaymentRailAdapter interface. Adapters are instantiated once and owned
 * by a RailRegistry; `settle(...)` is short-lived per transaction.
 *
 * Spec: PROTOCOL.md § Payment Rail Adapters.
 */

import type { EntityId, PaymentRailNomination } from './entity.js';

/**
 * A concrete monetary amount. Use string for the value so decimal
 * precision is not lost (never use JS `number` for money).
 */
export interface Money {
  /** Decimal string, e.g. "7.00". */
  value: string;
  /** ISO 4217 currency, e.g. "AUD". */
  currency: string;
}

/**
 * Human-readable description of what a given rail nomination needs
 * to settle. Used for consent prompts and UI surfaces.
 */
export interface RailDescription {
  railId: string;
  /** One-line summary the member can read before consenting. */
  summary: string;
  /** Typical time to settlement (human-readable). */
  typicalSettlementWindow: string;
  /** Optional fee estimate. */
  feeEstimate?: Money;
}

/**
 * Instruction from the Peer Protocol to actually move funds.
 *
 * Idempotent on (offer_id, commit_id): adapters MUST treat repeat
 * invocations with the same idempotency_key as the same transaction.
 */
export interface SettlementIntent {
  offer_id: string;
  commit_id: string;
  from_entity: EntityId;
  to_entity: EntityId;
  amount: Money;
  /** Counterparty's advertised rail nomination — where to send funds. */
  rail_nomination: PaymentRailNomination;
  /** Stable key derived from (offer_id, commit_id). */
  idempotency_key: string;
  /** Free-form reference for the payer's / payee's statement. */
  reference?: string;
}

/**
 * Stream of events emitted while a settlement is in flight. Events are
 * append-only; an adapter may emit zero or more `status_update` events
 * before a terminal `settled` or `failed`.
 */
export type SettlementEvent =
  | SettlementSubmittedEvent
  | SettlementStatusUpdateEvent
  | SettlementSettledEvent
  | SettlementFailedEvent;

export interface SettlementSubmittedEvent {
  kind: 'submitted';
  at: string;            // ISO 8601
  /** Rail-side identifier for this settlement (invoice id, PI id, etc.). */
  rail_reference: string;
}

export interface SettlementStatusUpdateEvent {
  kind: 'status_update';
  at: string;
  status: string;        // rail-specific token ("awaiting_confirmation", ...)
  message?: string;
}

export interface SettlementSettledEvent {
  kind: 'settled';
  at: string;
  /** Proof of settlement suitable for verifyProof on the counterparty. */
  proof: SettlementProof;
}

export interface SettlementFailedEvent {
  kind: 'failed';
  at: string;
  code: string;          // rail-specific error code
  message: string;
  /** True if the failure is transient and the commit may be retried. */
  retryable: boolean;
}

/**
 * Rail-specific proof of settlement. Shape is opaque to HMAN — the
 * adapter that produced it verifies it. `rail` discriminates.
 */
export interface SettlementProof {
  rail: string;          // e.g. "baink", "stripe", "osko"
  rail_reference: string;
  settled_at: string;    // ISO 8601
  amount: Money;
  /** Adapter-specific fields (ledger ids, tx hashes, reconciliation tokens). */
  details: Record<string, unknown>;
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
}

/**
 * The adapter interface. Implementations: baink (Monoova/Tyro/BPAY
 * aggregator), Stripe (international fallback), future OSKO-direct.
 */
export interface PaymentRailAdapter {
  readonly id: string;
  readonly currencies: string[];

  describe(nomination: PaymentRailNomination): RailDescription;

  settle(intent: SettlementIntent): AsyncIterable<SettlementEvent>;

  verifyProof(proof: SettlementProof): Promise<VerifyResult>;
}
