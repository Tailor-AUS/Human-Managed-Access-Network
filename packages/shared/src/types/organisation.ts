/**
 * Organisation — a business / collective equivalent of an .HMAN member.
 *
 * Where an {@link Entity} is a scoped persona under a *single* member, an
 * Organisation is a standing collective that *multiple* registered HMANs
 * join as members. It has its own Ed25519 signing key, its own nominated
 * payment rails, and — crucially — a governance policy describing how the
 * collective reaches consensus.
 *
 * Joining and collective decisions are expressed as PACT: every membership
 * is a two-sided, signed *join pact* (the HMAN consents, the org admits),
 * and every collective decision (admit, remove, change role, amend
 * governance) is a signed proposal resolved by signed votes against a
 * quorum + approval threshold.
 *
 * NOTE on PACT: the canonical PACT wire format lives in the external
 * `github.com/TailorAU/pact` repo (see CLAUDE.md § PACT relationship). The
 * shapes below are the .HMAN-side *envelopes* — they mirror exactly the
 * fields every consumer needs to verify a membership or a consensus result,
 * the same pattern already used by `PACTAttestation` in the connectors
 * module. When the external spec pins the canonical encoding we narrow these.
 *
 * Full spec: PROTOCOL.md § Organisation Model.
 */

import type { EntityId, MemberId, PaymentRailNomination } from './entity.js';

export type OrganisationId = string;
export type MembershipId = string;
export type ProposalId = string;

/** The legal / social shape of the collective. Informational only. */
export enum OrgKind {
  Company = 'company',
  Cooperative = 'cooperative',
  Association = 'association',
  Dao = 'dao',
  Partnership = 'partnership',
}

export enum OrgStatus {
  Active = 'active',
  Suspended = 'suspended',
  Dissolved = 'dissolved',
}

/** A member's standing inside an organisation. */
export enum OrgRole {
  /** Founder-level: can do anything, cannot be removed by a vote. */
  Owner = 'owner',
  /** Can invite / admit / suspend members and open proposals. */
  Admin = 'admin',
  /** Ordinary voting member. */
  Member = 'member',
  /** Read-only — present in the roster, no vote, no admit rights. */
  Observer = 'observer',
}

export enum MembershipStatus {
  /** Org invited this HMAN; awaiting the HMAN's signed acceptance. */
  Invited = 'invited',
  /** HMAN requested to join; awaiting the org's admission. */
  Requested = 'requested',
  /** Both sides signed — a complete join pact. */
  Active = 'active',
  /** Temporarily paused; can be reinstated. */
  Suspended = 'suspended',
  /** Permanently removed. */
  Revoked = 'revoked',
}

/** How a `Requested` membership becomes `Active`. */
export enum AdmissionRule {
  /** The owner alone admits. */
  Founder = 'founder',
  /** Any owner or admin admits directly. */
  Admins = 'admins',
  /** Admission requires a PACT consensus vote (an `admit_member` proposal). */
  Quorum = 'quorum',
}

/**
 * Governance policy — how the collective reaches consensus (PACT).
 *
 * A proposal is *accepted* when both hold:
 *   - quorum:    cast / eligible            >= `quorum`
 *   - threshold: approve / (approve+reject) >= `approval_threshold`
 *
 * `abstain` votes count toward quorum (participation) but not toward the
 * approval ratio.
 */
export interface OrgGovernancePolicy {
  admission_rule: AdmissionRule;
  /** Fraction in (0, 1] of eligible voters that must cast a vote. */
  quorum: number;
  /** Fraction in (0, 1] of decisive (non-abstain) votes that must approve. */
  approval_threshold: number;
  /** Roles permitted to cast votes. */
  voting_roles: OrgRole[];
  /** Default lifetime of a proposal, in seconds, before it expires. */
  proposal_ttl_seconds: number;
}

/**
 * Sensible default: admins admit members directly, simple-majority
 * consensus for everything else, a one-week proposal window.
 */
export const DEFAULT_ORG_GOVERNANCE: OrgGovernancePolicy = {
  admission_rule: AdmissionRule.Admins,
  quorum: 0.5,
  approval_threshold: 0.5,
  voting_roles: [OrgRole.Owner, OrgRole.Admin, OrgRole.Member],
  proposal_ttl_seconds: 7 * 24 * 60 * 60,
};

/**
 * Canonical Organisation record. The private signing key is persisted
 * separately (see {@link OrgKeyData}); only the public key lives here.
 */
export interface Organisation {
  id: OrganisationId;
  kind: OrgKind;
  display_name: string;
  /** Root member identity of the founder. */
  founder_member_id: MemberId;
  created_at: string;
  updated_at: string;
  /** Ed25519 public key of the organisation's signing key (base64). */
  key_pub: string;
  /** Payment rails nominated by the org (reuses the entity rail shapes). */
  nominated_rails: PaymentRailNomination[];
  /** How the collective admits members and reaches consensus (PACT). */
  governance: OrgGovernancePolicy;
  status: OrgStatus;
  /** Free-form metadata (ABN, jurisdiction, mission, …). */
  metadata?: Record<string, string>;
}

/**
 * Encrypted signing-key material for an organisation. Mirrors
 * {@link EntityKeyData}; the secret key is encrypted with the holder's
 * master key.
 */
export interface OrgKeyData {
  org_id: OrganisationId;
  public_key: string;
  encrypted_secret_key: string;
  nonce: string;
  created_at: string;
}

/**
 * A membership links one registered HMAN (a specific entity under a member)
 * into an organisation. It is only `Active` once a complete two-sided join
 * pact has been signed.
 */
export interface OrgMembership {
  id: MembershipId;
  org_id: OrganisationId;
  /** Root member identity of the joining HMAN. */
  member_id: MemberId;
  /** The specific entity (persona) the HMAN joins as. */
  entity_id: EntityId;
  /** Ed25519 public key of the joining entity (base64). */
  entity_pub: string;
  role: OrgRole;
  status: MembershipStatus;
  created_at: string;
  updated_at: string;
  /** Membership id of the inviter, for invited memberships. */
  invited_by?: MembershipId;

  // --- join-pact assembly (PACT) ---------------------------------------
  /** Timestamp fixed when the first party signs; both sign the same body. */
  attestation_issued_at?: string;
  /** Joining entity's signature over the canonical join body (base64). */
  member_signature?: string;
  /** Organisation's signature over the canonical join body (base64). */
  org_signature?: string;
  /** Assembled + verified pact, present once the membership is `Active`. */
  join_attestation?: OrgJoinAttestation;
}

/**
 * The signed two-sided agreement that admits an HMAN into an organisation.
 * Both signatures are over the identical canonical body.
 */
export interface OrgJoinAttestation {
  org_id: OrganisationId;
  membership_id: MembershipId;
  member_id: MemberId;
  entity_id: EntityId;
  role: OrgRole;
  /** base64 Ed25519 public key of the joining entity. */
  entity_pub: string;
  /** Entity's signature (consent to join). */
  member_signature: string;
  /** base64 Ed25519 public key of the organisation. */
  org_pub: string;
  /** Organisation's signature (admission). */
  org_signature: string;
  /** Proposal id of the consensus that authorised admission, if quorum-based. */
  consensus_ref?: ProposalId;
  issued_at: string;
}

// ---------------------------------------------------------------------------
// PACT consensus primitives
// ---------------------------------------------------------------------------

export enum ProposalKind {
  AdmitMember = 'admit_member',
  RemoveMember = 'remove_member',
  ChangeRole = 'change_role',
  UpdateGovernance = 'update_governance',
  Custom = 'custom',
}

export enum ProposalStatus {
  Open = 'open',
  Accepted = 'accepted',
  Rejected = 'rejected',
  Expired = 'expired',
  Withdrawn = 'withdrawn',
}

export type VoteDecision = 'approve' | 'reject' | 'abstain';

/**
 * A PACT proposal — a collective decision put to the voting members.
 * `TPayload` is kind-specific (e.g. `{ role }` for a ChangeRole proposal,
 * a partial `OrgGovernancePolicy` for UpdateGovernance).
 */
export interface PactProposal<TPayload = unknown> {
  id: ProposalId;
  org_id: OrganisationId;
  kind: ProposalKind;
  /** Membership id that opened the proposal. */
  proposed_by: MembershipId;
  /** The membership the proposal acts on (admit / remove / change role). */
  subject_membership_id?: MembershipId;
  /** Kind-specific payload. */
  payload: TPayload;
  /** Member-facing one-line summary. */
  description: string;
  created_at: string;
  expires_at: string;
  status: ProposalStatus;
  /** Sealed result, present once the proposal reaches a terminal state. */
  consensus?: PactConsensusRecord;
}

/** A single signed vote on a proposal. */
export interface PactVote {
  proposal_id: ProposalId;
  /** Voter's membership id. */
  voter_membership_id: MembershipId;
  /** Voter's entity id — the key that signed. */
  voter_entity_id: EntityId;
  decision: VoteDecision;
  /** Voting weight (default 1). */
  weight: number;
  /** base64 Ed25519 signature over the canonical vote body. */
  signature: string;
  /** base64 Ed25519 public key of the voting entity. */
  voter_pub: string;
  cast_at: string;
}

/** The arithmetic of a tally — pure, derived from votes + eligibility. */
export interface PactTally {
  /** Total weight of eligible voters at tally time. */
  eligible: number;
  approve: number;
  reject: number;
  abstain: number;
  /** approve + reject + abstain (cast weight). */
  cast: number;
  quorum_met: boolean;
  /** approve / (approve + reject); 0 when no decisive votes. */
  approval_ratio: number;
}

/** The sealed, org-signed outcome of a proposal. */
export interface PactConsensusRecord {
  proposal_id: ProposalId;
  org_id: OrganisationId;
  reached: boolean;
  outcome: 'accepted' | 'rejected';
  tally: PactTally;
  decided_at: string;
  /** Organisation signature sealing the result (base64). */
  org_signature: string;
  org_pub: string;
}

/**
 * Lightweight, decoupled audit hook. The org manager emits these on every
 * lifecycle event; callers can forward them to the member's hash-chained
 * audit log or drop them. Kept generic so the fixed `AuditAction` union
 * doesn't have to grow per org event.
 */
export interface OrgAuditEvent {
  type:
    | 'org_created'
    | 'membership_requested'
    | 'membership_invited'
    | 'membership_accepted'
    | 'membership_admitted'
    | 'membership_suspended'
    | 'membership_reinstated'
    | 'membership_revoked'
    | 'role_changed'
    | 'proposal_opened'
    | 'vote_cast'
    | 'proposal_finalized'
    | 'governance_updated';
  org_id: OrganisationId;
  at: string;
  detail: Record<string, unknown>;
}
