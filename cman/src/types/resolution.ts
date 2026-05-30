/**
 * Resolutions — how the collective decides. A resolution is a signed proposal
 * resolved by signed votes, tallied against the rule the constitution sets for
 * its {@link ResolutionClass}. This is the PACT consensus primitive, applied
 * to corporate decision-making.
 */

import type { Attestation } from '../crypto/signer.js';
import type { Id, ISODate } from './common.js';
import type { OrgRole } from './governance.js';

/** The class of a resolution — picks the threshold/quorum/basis rule. */
export enum ResolutionClass {
  /** Simple majority of members/votes. */
  Ordinary = 'ordinary',
  /** Super-majority (typically 75%) — constitutional change, etc. */
  Special = 'special',
  /** Requires every eligible vote in favour. */
  Unanimous = 'unanimous',
  /** A resolution of the board of directors. */
  Board = 'board',
}

/** How voting power is measured for a resolution. */
export enum VotingBasis {
  /** One member, one vote. */
  PerCapita = 'per_capita',
  /** Weighted by voting shares held. */
  PerShare = 'per_share',
  /** One director, one vote (board resolutions). */
  Board = 'board',
}

export enum ResolutionStatus {
  Open = 'open',
  Carried = 'carried',
  NotCarried = 'not_carried',
  Lapsed = 'lapsed',
  Withdrawn = 'withdrawn',
}

/** What an accepted resolution does when it carries. */
export enum ResolutionKind {
  AdmitMember = 'admit_member',
  RemoveMember = 'remove_member',
  ChangeRoles = 'change_roles',
  AppointDirector = 'appoint_director',
  RemoveDirector = 'remove_director',
  AppointOfficer = 'appoint_officer',
  RemoveOfficer = 'remove_officer',
  IssueShares = 'issue_shares',
  TransferShares = 'transfer_shares',
  AmendConstitution = 'amend_constitution',
  DeclareDividend = 'declare_dividend',
  Dissolve = 'dissolve',
  Custom = 'custom',
}

export type VoteDecision = 'for' | 'against' | 'abstain';

export interface Resolution<TPayload = unknown> {
  id: Id;
  org_id: Id;
  kind: ResolutionKind;
  class: ResolutionClass;
  /** Membership that moved the resolution. */
  proposed_by: Id;
  /** Membership the resolution acts on (admit/remove/appoint…). */
  subject_membership_id?: Id;
  /** Kind-specific data (shares to issue, clauses to adopt, role set, …). */
  payload: TPayload;
  description: string;
  created_at: ISODate;
  expires_at: ISODate;
  status: ResolutionStatus;
  /** Optional meeting this resolution was put to. */
  meeting_ref?: Id;
  /** Sealed outcome, present once decided. */
  consensus?: ConsensusRecord;
}

export interface Vote {
  resolution_id: Id;
  voter_membership_id: Id;
  voter_public_key: string;
  decision: VoteDecision;
  /** Voting power applied (1 per capita; share votes for per-share). */
  weight: number;
  /** base64url signature over the canonical vote body. */
  signature: string;
  cast_at: ISODate;
}

/** Pure arithmetic of a poll. */
export interface Tally {
  basis: VotingBasis;
  /** Total eligible voting weight at tally time (quorum denominator). */
  eligible_weight: number;
  for: number;
  against: number;
  abstain: number;
  /** for + against + abstain. */
  cast: number;
  quorum_met: boolean;
  /** for / (for + against); 0 when no decisive votes. */
  approval_ratio: number;
}

/** Org-sealed, tamper-evident outcome of a resolution (PACT "truth"). */
export interface ConsensusRecord {
  resolution_id: Id;
  org_id: Id;
  class: ResolutionClass;
  carried: boolean;
  tally: Tally;
  decided_at: ISODate;
  /** Organisation signature sealing the result. */
  seal: Attestation;
}

// --- payload shapes for the typed resolution kinds -------------------------

export interface ChangeRolesPayload {
  roles: OrgRole[];
}
export interface AppointDirectorPayload {
  title: 'director' | 'chair' | 'managing_director';
}
export interface AppointOfficerPayload {
  office: string;
}
export interface IssueSharesPayload {
  class_code: string;
  quantity: number;
}
export interface TransferSharesPayload {
  class_code: string;
  to_membership_id: Id;
  quantity: number;
}
