/**
 * OrganisationManager — the business / collective equivalent of an .HMAN
 * member. Registered HMANs join an organisation through a signed two-sided
 * join pact, and the collective makes decisions through PACT proposals.
 *
 * See PROTOCOL.md § Organisation Model.
 *
 * Key model: an organisation has its own Ed25519 signing key. We reuse the
 * KeyManager's entity-key cache for it (the cache is keyed by an opaque id —
 * here, the org id), so the org's secret key follows the same
 * seal / unseal / wipe lifecycle as entity keys and never has to be
 * re-implemented. Joining entities sign with their *own* keys, which must be
 * loaded in the same KeyManager (the member's node holds them).
 */

import { v4 as uuidv4 } from 'uuid';
import {
  OrgKind,
  OrgStatus,
  OrgRole,
  MembershipStatus,
  AdmissionRule,
  ProposalKind,
  ProposalStatus,
  DEFAULT_ORG_GOVERNANCE,
  type EntityId,
  type MemberId,
  type Organisation,
  type OrganisationId,
  type OrgKeyData,
  type OrgGovernancePolicy,
  type OrgMembership,
  type MembershipId,
  type OrgJoinAttestation,
  type PaymentRailNomination,
  type PactProposal,
  type PactVote,
  type PactConsensusRecord,
  type ProposalId,
  type VoteDecision,
  type OrgAuditEvent,
} from '@hman/shared';
import { KeyManager } from '../crypto/keys.js';
import { canonicalJsonBytes } from '../entity/entity-manager.js';
import { verifyDetachedEd25519 } from '../entity/entity-keys.js';
import {
  tallyVotes,
  isAccepted,
  isDecided,
  outcomeOf,
  VOTE_DECISIONS,
} from './pact-consensus.js';

export enum OrgErrorCode {
  NotFound = 'ORG_NOT_FOUND',
  MembershipNotFound = 'MEMBERSHIP_NOT_FOUND',
  ProposalNotFound = 'PROPOSAL_NOT_FOUND',
  AlreadyMember = 'ALREADY_MEMBER',
  NotAuthorized = 'NOT_AUTHORIZED',
  InvalidState = 'INVALID_STATE',
  InvalidInput = 'INVALID_INPUT',
  KeyManagerLocked = 'KEY_MANAGER_LOCKED',
  KeyNotLoaded = 'KEY_NOT_LOADED',
  ConsensusNotReached = 'CONSENSUS_NOT_REACHED',
  DuplicateVote = 'DUPLICATE_VOTE',
}

export class OrgError extends Error {
  constructor(
    message: string,
    public readonly code: OrgErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'OrgError';
  }
}

export interface OrganisationStorage {
  saveOrg(org: Organisation): Promise<void>;
  getOrg(id: OrganisationId): Promise<Organisation | null>;
  getAllOrgs(): Promise<Organisation[]>;
  deleteOrg(id: OrganisationId): Promise<void>;

  saveOrgKey(key: OrgKeyData): Promise<void>;
  getOrgKey(orgId: OrganisationId): Promise<OrgKeyData | null>;
  getAllOrgKeys(): Promise<OrgKeyData[]>;
  deleteOrgKey(orgId: OrganisationId): Promise<void>;

  saveMembership(m: OrgMembership): Promise<void>;
  getMembership(id: MembershipId): Promise<OrgMembership | null>;
  getMembershipsByOrg(orgId: OrganisationId): Promise<OrgMembership[]>;
  getMembershipsByMember(memberId: MemberId): Promise<OrgMembership[]>;
  deleteMembership(id: MembershipId): Promise<void>;

  saveProposal(p: PactProposal): Promise<void>;
  getProposal(id: ProposalId): Promise<PactProposal | null>;
  getProposalsByOrg(orgId: OrganisationId): Promise<PactProposal[]>;
  saveVote(v: PactVote): Promise<void>;
  getVotes(proposalId: ProposalId): Promise<PactVote[]>;
}

export interface OrganisationManagerConfig {
  storage: OrganisationStorage;
  keyManager: KeyManager;
  /** Optional sink for lifecycle events (forward to a hash-chained audit log). */
  onAudit?: (event: OrgAuditEvent) => void | Promise<void>;
  /** Override for the wall clock — handy in tests. */
  now?: () => Date;
}

export interface CreateOrganisationInput {
  display_name: string;
  kind?: OrgKind;
  /** Founder's root member id. */
  founder_member_id: MemberId;
  /** Founder's entity that becomes the owner membership. */
  founder_entity_id: EntityId;
  /** Founder entity's published Ed25519 public key (base64). */
  founder_entity_pub: string;
  nominated_rails?: PaymentRailNomination[];
  governance?: Partial<OrgGovernancePolicy>;
  metadata?: Record<string, string>;
}

export interface JoinRequestInput {
  org_id: OrganisationId;
  member_id: MemberId;
  entity_id: EntityId;
  entity_pub: string;
  /** Role requested; actual role granted is decided at admission. */
  role?: OrgRole;
}

export interface InviteInput {
  org_id: OrganisationId;
  /** Membership id of the owner/admin issuing the invite. */
  inviter_membership_id: MembershipId;
  member_id: MemberId;
  entity_id: EntityId;
  entity_pub: string;
  role?: OrgRole;
}

export interface OpenProposalInput<TPayload = unknown> {
  org_id: OrganisationId;
  proposed_by: MembershipId;
  kind: ProposalKind;
  subject_membership_id?: MembershipId;
  payload?: TPayload;
  description?: string;
  ttl_seconds?: number;
}

export interface CastVoteInput {
  proposal_id: ProposalId;
  voter_membership_id: MembershipId;
  decision: VoteDecision;
  weight?: number;
}

const PACT_JOIN_DOMAIN = 'hman.org.join';
const PACT_VOTE_DOMAIN = 'hman.org.vote';
const PACT_CONSENSUS_DOMAIN = 'hman.org.consensus';

export class OrganisationManager {
  private storage: OrganisationStorage;
  private keyManager: KeyManager;
  private onAudit?: (event: OrgAuditEvent) => void | Promise<void>;
  private now: () => Date;

  constructor(config: OrganisationManagerConfig) {
    this.storage = config.storage;
    this.keyManager = config.keyManager;
    this.onAudit = config.onAudit;
    this.now = config.now ?? (() => new Date());
  }

  // ---------------------------------------------------------------------------
  // Organisation lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Found a new organisation. Generates the org signing key, signs the
   * founder's owner membership as a complete join pact, and returns both.
   * The founder's entity key must be loaded in the KeyManager.
   */
  async createOrganisation(
    input: CreateOrganisationInput
  ): Promise<{ org: Organisation; founderMembership: OrgMembership }> {
    this.requireUnlocked();
    this.validateString(input.display_name, 'display_name', 255);
    this.validateString(input.founder_entity_pub, 'founder_entity_pub', 1024);
    this.requireEntityKey(input.founder_entity_id);

    const id: OrganisationId = uuidv4();
    const orgKey = this.keyManager.createEntityKey(id);
    const nowIso = this.iso();

    const governance: OrgGovernancePolicy = {
      ...DEFAULT_ORG_GOVERNANCE,
      ...input.governance,
      voting_roles: input.governance?.voting_roles ?? DEFAULT_ORG_GOVERNANCE.voting_roles,
    };
    this.validateGovernance(governance);

    const org: Organisation = {
      id,
      kind: input.kind ?? OrgKind.Company,
      display_name: input.display_name,
      founder_member_id: input.founder_member_id,
      created_at: nowIso,
      updated_at: nowIso,
      key_pub: orgKey.public_key,
      nominated_rails: input.nominated_rails ?? [],
      governance,
      status: OrgStatus.Active,
      ...(input.metadata && { metadata: input.metadata }),
    };

    await this.storage.saveOrgKey(this.toOrgKeyData(orgKey));
    await this.storage.saveOrg(org);

    // The founder is admitted immediately as Owner — both signatures now.
    const membership: OrgMembership = {
      id: uuidv4(),
      org_id: id,
      member_id: input.founder_member_id,
      entity_id: input.founder_entity_id,
      entity_pub: input.founder_entity_pub,
      role: OrgRole.Owner,
      status: MembershipStatus.Active,
      created_at: nowIso,
      updated_at: nowIso,
      attestation_issued_at: nowIso,
    };
    const body = this.joinBody(membership);
    membership.member_signature = this.keyManager.signAsEntity(input.founder_entity_id, body);
    membership.org_signature = this.signAsOrg(id, body);
    membership.join_attestation = this.assembleJoinAttestation(org, membership);

    await this.storage.saveMembership(membership);
    await this.emit('org_created', id, { org_id: id, founder_membership: membership.id });
    return { org, founderMembership: membership };
  }

  async getOrganisation(id: OrganisationId): Promise<Organisation | null> {
    return this.storage.getOrg(id);
  }

  async getAllOrganisations(): Promise<Organisation[]> {
    return this.storage.getAllOrgs();
  }

  async updateGovernance(
    orgId: OrganisationId,
    patch: Partial<OrgGovernancePolicy>
  ): Promise<Organisation> {
    const org = await this.mustGetOrg(orgId);
    const governance: OrgGovernancePolicy = { ...org.governance, ...patch };
    this.validateGovernance(governance);
    const next: Organisation = { ...org, governance, updated_at: this.iso() };
    await this.storage.saveOrg(next);
    await this.emit('governance_updated', orgId, { governance });
    return next;
  }

  async setStatus(orgId: OrganisationId, status: OrgStatus): Promise<Organisation> {
    const org = await this.mustGetOrg(orgId);
    const next: Organisation = { ...org, status, updated_at: this.iso() };
    await this.storage.saveOrg(next);
    return next;
  }

  // ---------------------------------------------------------------------------
  // Membership — request / invite / admit
  // ---------------------------------------------------------------------------

  /**
   * A registered HMAN requests to join. The joining entity signs its consent
   * now (the member side of the pact); the org side is added at admission.
   * The entity's key must be loaded in the KeyManager.
   */
  async requestToJoin(input: JoinRequestInput): Promise<OrgMembership> {
    this.requireUnlocked();
    const org = await this.mustGetActiveOrg(input.org_id);
    this.requireEntityKey(input.entity_id);
    await this.assertNotAlreadyMember(input.org_id, input.entity_id);

    const nowIso = this.iso();
    const membership: OrgMembership = {
      id: uuidv4(),
      org_id: org.id,
      member_id: input.member_id,
      entity_id: input.entity_id,
      entity_pub: input.entity_pub,
      role: input.role ?? OrgRole.Member,
      status: MembershipStatus.Requested,
      created_at: nowIso,
      updated_at: nowIso,
      attestation_issued_at: nowIso,
    };
    membership.member_signature = this.keyManager.signAsEntity(
      input.entity_id,
      this.joinBody(membership)
    );

    await this.storage.saveMembership(membership);
    await this.emit('membership_requested', org.id, { membership_id: membership.id });
    return membership;
  }

  /**
   * An owner/admin invites an HMAN. The org signs admission now; the invited
   * member completes the pact via {@link acceptInvite}.
   */
  async inviteMember(input: InviteInput): Promise<OrgMembership> {
    this.requireUnlocked();
    const org = await this.mustGetActiveOrg(input.org_id);
    await this.requireRole(input.inviter_membership_id, org.id, [OrgRole.Owner, OrgRole.Admin]);
    await this.assertNotAlreadyMember(input.org_id, input.entity_id);

    const nowIso = this.iso();
    const membership: OrgMembership = {
      id: uuidv4(),
      org_id: org.id,
      member_id: input.member_id,
      entity_id: input.entity_id,
      entity_pub: input.entity_pub,
      role: input.role ?? OrgRole.Member,
      status: MembershipStatus.Invited,
      created_at: nowIso,
      updated_at: nowIso,
      invited_by: input.inviter_membership_id,
      attestation_issued_at: nowIso,
    };
    membership.org_signature = this.signAsOrg(org.id, this.joinBody(membership));

    await this.storage.saveMembership(membership);
    await this.emit('membership_invited', org.id, {
      membership_id: membership.id,
      invited_by: input.inviter_membership_id,
    });
    return membership;
  }

  /**
   * The invited HMAN accepts: signs its side, completing the join pact.
   * The entity's key must be loaded.
   */
  async acceptInvite(membershipId: MembershipId): Promise<OrgMembership> {
    this.requireUnlocked();
    const m = await this.mustGetMembership(membershipId);
    if (m.status !== MembershipStatus.Invited) {
      throw new OrgError(
        `Membership ${membershipId} is not awaiting acceptance (status=${m.status})`,
        OrgErrorCode.InvalidState
      );
    }
    this.requireEntityKey(m.entity_id);
    const org = await this.mustGetOrg(m.org_id);

    m.member_signature = this.keyManager.signAsEntity(m.entity_id, this.joinBody(m));
    return this.finishActivation(org, m, 'membership_accepted');
  }

  /**
   * Admit a `Requested` membership directly (founder/admins admission rules).
   * For quorum-based governance use {@link openProposal} with
   * `ProposalKind.AdmitMember` instead.
   */
  async admitMember(
    membershipId: MembershipId,
    actingMembershipId?: MembershipId
  ): Promise<OrgMembership> {
    this.requireUnlocked();
    const m = await this.mustGetMembership(membershipId);
    if (m.status !== MembershipStatus.Requested) {
      throw new OrgError(
        `Membership ${membershipId} is not pending admission (status=${m.status})`,
        OrgErrorCode.InvalidState
      );
    }
    const org = await this.mustGetOrg(m.org_id);

    switch (org.governance.admission_rule) {
      case AdmissionRule.Founder:
        await this.requireRole(actingMembershipId, org.id, [OrgRole.Owner]);
        break;
      case AdmissionRule.Admins:
        await this.requireRole(actingMembershipId, org.id, [OrgRole.Owner, OrgRole.Admin]);
        break;
      case AdmissionRule.Quorum:
        throw new OrgError(
          'This organisation admits by consensus — open an admit_member proposal',
          OrgErrorCode.NotAuthorized
        );
    }

    if (!m.member_signature) {
      throw new OrgError(
        'Cannot admit: joining member has not signed their consent',
        OrgErrorCode.InvalidState
      );
    }
    m.org_signature = this.signAsOrg(org.id, this.joinBody(m));
    return this.finishActivation(org, m, 'membership_admitted');
  }

  async listMemberships(orgId: OrganisationId): Promise<OrgMembership[]> {
    return this.storage.getMembershipsByOrg(orgId);
  }

  async getMembership(id: MembershipId): Promise<OrgMembership | null> {
    return this.storage.getMembership(id);
  }

  async listMembershipsForMember(memberId: MemberId): Promise<OrgMembership[]> {
    return this.storage.getMembershipsByMember(memberId);
  }

  async changeRole(membershipId: MembershipId, role: OrgRole): Promise<OrgMembership> {
    const m = await this.mustGetMembership(membershipId);
    const next: OrgMembership = { ...m, role, updated_at: this.iso() };
    await this.storage.saveMembership(next);
    await this.emit('role_changed', m.org_id, { membership_id: membershipId, role });
    return next;
  }

  async suspendMembership(membershipId: MembershipId): Promise<OrgMembership> {
    return this.transition(membershipId, MembershipStatus.Suspended, 'membership_suspended');
  }

  async reinstateMembership(membershipId: MembershipId): Promise<OrgMembership> {
    return this.transition(membershipId, MembershipStatus.Active, 'membership_reinstated');
  }

  async revokeMembership(membershipId: MembershipId): Promise<OrgMembership> {
    return this.transition(membershipId, MembershipStatus.Revoked, 'membership_revoked');
  }

  // ---------------------------------------------------------------------------
  // PACT — proposals, votes, consensus
  // ---------------------------------------------------------------------------

  /** Open a proposal. The proposer must be an active voting member. */
  async openProposal<TPayload = unknown>(
    input: OpenProposalInput<TPayload>
  ): Promise<PactProposal<TPayload>> {
    const org = await this.mustGetActiveOrg(input.org_id);
    const proposer = await this.requireRole(
      input.proposed_by,
      org.id,
      org.governance.voting_roles
    );
    void proposer;

    if (input.kind === ProposalKind.AdmitMember) {
      const subject = await this.requireSubject(input.subject_membership_id, org.id);
      if (subject.status !== MembershipStatus.Requested) {
        throw new OrgError(
          'admit_member proposal subject must be a Requested membership',
          OrgErrorCode.InvalidState
        );
      }
    }

    const now = this.now();
    const ttl = input.ttl_seconds ?? org.governance.proposal_ttl_seconds;
    const proposal: PactProposal<TPayload> = {
      id: uuidv4(),
      org_id: org.id,
      kind: input.kind,
      proposed_by: input.proposed_by,
      subject_membership_id: input.subject_membership_id,
      payload: (input.payload ?? {}) as TPayload,
      description: input.description ?? this.describeProposal(input.kind),
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + ttl * 1000).toISOString(),
      status: ProposalStatus.Open,
    };

    await this.storage.saveProposal(proposal as PactProposal);
    await this.emit('proposal_opened', org.id, {
      proposal_id: proposal.id,
      kind: proposal.kind,
    });
    return proposal;
  }

  /**
   * Cast a signed vote. The voter must be an active voting member and may
   * vote at most once. Auto-finalizes once every eligible voter has voted.
   */
  async castVote(input: CastVoteInput): Promise<PactProposal> {
    this.requireUnlocked();
    if (!VOTE_DECISIONS.includes(input.decision)) {
      throw new OrgError(`Invalid vote decision: ${input.decision}`, OrgErrorCode.InvalidInput);
    }
    const proposal = await this.mustGetProposal(input.proposal_id);
    const org = await this.mustGetOrg(proposal.org_id);

    if (proposal.status !== ProposalStatus.Open) {
      throw new OrgError(
        `Proposal ${proposal.id} is not open (status=${proposal.status})`,
        OrgErrorCode.InvalidState
      );
    }
    if (this.isExpired(proposal)) {
      await this.finalize(proposal, org); // settles to Expired/terminal
      throw new OrgError('Proposal has expired', OrgErrorCode.InvalidState);
    }

    const voter = await this.requireRole(
      input.voter_membership_id,
      org.id,
      org.governance.voting_roles
    );
    this.requireEntityKey(voter.entity_id);

    const existing = await this.storage.getVotes(proposal.id);
    if (existing.some((v) => v.voter_membership_id === voter.id)) {
      throw new OrgError('Member has already voted on this proposal', OrgErrorCode.DuplicateVote);
    }

    const cast_at = this.iso();
    const weight = input.weight && input.weight > 0 ? input.weight : 1;
    const voteBody = canonicalJsonBytes({
      domain: PACT_VOTE_DOMAIN,
      proposal_id: proposal.id,
      voter_membership_id: voter.id,
      voter_entity_id: voter.entity_id,
      decision: input.decision,
      weight,
      cast_at,
    });
    const vote: PactVote = {
      proposal_id: proposal.id,
      voter_membership_id: voter.id,
      voter_entity_id: voter.entity_id,
      decision: input.decision,
      weight,
      signature: this.keyManager.signAsEntity(voter.entity_id, voteBody),
      voter_pub: voter.entity_pub,
      cast_at,
    };
    await this.storage.saveVote(vote);
    await this.emit('vote_cast', org.id, {
      proposal_id: proposal.id,
      voter_membership_id: voter.id,
      decision: input.decision,
    });

    // Finalize automatically only when the whole eligible pool has voted —
    // earlier closure is an explicit caller decision via finalizeProposal().
    const eligible = await this.eligibleVoters(org);
    const votes = await this.storage.getVotes(proposal.id);
    if (votes.length >= eligible.length) {
      return this.finalize(proposal, org);
    }
    return proposal;
  }

  /** Tally without mutating — a read-only view of where a proposal stands. */
  async tally(proposalId: ProposalId) {
    const proposal = await this.mustGetProposal(proposalId);
    const org = await this.mustGetOrg(proposal.org_id);
    const eligible = await this.eligibleVoters(org);
    const eligibleWeight = eligible.length; // weight 1 per eligible member
    const votes = await this.storage.getVotes(proposalId);
    return tallyVotes(votes, eligibleWeight, org.governance);
  }

  /**
   * Resolve a proposal now. Succeeds once quorum is met (accept/reject by the
   * decisive ratio) or once the proposal has expired; otherwise throws
   * `ConsensusNotReached` and leaves it open.
   */
  async finalizeProposal(proposalId: ProposalId): Promise<PactProposal> {
    const proposal = await this.mustGetProposal(proposalId);
    const org = await this.mustGetOrg(proposal.org_id);
    if (proposal.status !== ProposalStatus.Open) return proposal;

    const eligible = await this.eligibleVoters(org);
    const votes = await this.storage.getVotes(proposal.id);
    const tally = tallyVotes(votes, eligible.length, org.governance);
    const allVoted = votes.length >= eligible.length;

    if (!this.isExpired(proposal) && !isDecided(tally, org.governance, allVoted)) {
      throw new OrgError(
        'Quorum not yet reached and proposal has not expired',
        OrgErrorCode.ConsensusNotReached
      );
    }
    return this.finalize(proposal, org);
  }

  async getProposal(id: ProposalId): Promise<PactProposal | null> {
    return this.storage.getProposal(id);
  }

  async listProposals(orgId: OrganisationId): Promise<PactProposal[]> {
    return this.storage.getProposalsByOrg(orgId);
  }

  async getVotes(proposalId: ProposalId): Promise<PactVote[]> {
    return this.storage.getVotes(proposalId);
  }

  // ---------------------------------------------------------------------------
  // Verification
  // ---------------------------------------------------------------------------

  /** Verify a membership's join pact: both signatures over the same body. */
  async verifyMembership(membershipId: MembershipId): Promise<boolean> {
    const m = await this.storage.getMembership(membershipId);
    if (!m || !m.join_attestation) return false;
    const org = await this.storage.getOrg(m.org_id);
    if (!org) return false;
    return this.verifyJoinAttestation(m.join_attestation, org.key_pub);
  }

  /** Verify a standalone join attestation against the org's public key. */
  verifyJoinAttestation(att: OrgJoinAttestation, orgPub: string): boolean {
    if (att.org_pub !== orgPub) return false;
    const body = this.joinBody({
      org_id: att.org_id,
      id: att.membership_id,
      member_id: att.member_id,
      entity_id: att.entity_id,
      entity_pub: att.entity_pub,
      role: att.role,
      attestation_issued_at: att.issued_at,
    });
    return (
      verifyDetachedEd25519(body, att.member_signature, att.entity_pub) &&
      verifyDetachedEd25519(body, att.org_signature, att.org_pub)
    );
  }

  /** Verify the signed seal on a consensus record. */
  verifyConsensus(record: PactConsensusRecord): boolean {
    const body = this.consensusBody(record);
    return verifyDetachedEd25519(body, record.org_signature, record.org_pub);
  }

  // ---------------------------------------------------------------------------
  // Internal — activation, finalization, side effects
  // ---------------------------------------------------------------------------

  private async finishActivation(
    org: Organisation,
    m: OrgMembership,
    event: OrgAuditEvent['type']
  ): Promise<OrgMembership> {
    m.status = MembershipStatus.Active;
    m.updated_at = this.iso();
    m.join_attestation = this.assembleJoinAttestation(org, m);
    await this.storage.saveMembership(m);
    await this.emit(event, org.id, { membership_id: m.id, role: m.role });
    return m;
  }

  private async finalize(proposal: PactProposal, org: Organisation): Promise<PactProposal> {
    const eligible = await this.eligibleVoters(org);
    const votes = await this.storage.getVotes(proposal.id);
    const tally = tallyVotes(votes, eligible.length, org.governance);

    const decidedAt = this.iso();
    const expired = this.isExpired(proposal);
    const allVoted = votes.length >= eligible.length;

    let outcome: 'accepted' | 'rejected';
    let reached: boolean;
    if (isDecided(tally, org.governance, allVoted)) {
      outcome = outcomeOf(tally, org.governance);
      reached = isAccepted(tally, org.governance);
    } else {
      // Expired without quorum — treated as a non-reached rejection.
      outcome = 'rejected';
      reached = false;
    }

    const record: PactConsensusRecord = {
      proposal_id: proposal.id,
      org_id: org.id,
      reached,
      outcome,
      tally,
      decided_at: decidedAt,
      org_pub: org.key_pub,
      org_signature: '',
    };
    record.org_signature = this.signAsOrg(org.id, this.consensusBody(record));

    proposal.consensus = record;
    proposal.status = expired && !reached ? ProposalStatus.Expired
      : outcome === 'accepted' ? ProposalStatus.Accepted
      : ProposalStatus.Rejected;

    await this.storage.saveProposal(proposal);

    if (reached && outcome === 'accepted') {
      await this.applyProposalEffect(proposal, org);
    }
    await this.emit('proposal_finalized', org.id, {
      proposal_id: proposal.id,
      outcome,
      reached,
      status: proposal.status,
    });
    return proposal;
  }

  private async applyProposalEffect(proposal: PactProposal, org: Organisation): Promise<void> {
    switch (proposal.kind) {
      case ProposalKind.AdmitMember: {
        const m = await this.requireSubject(proposal.subject_membership_id, org.id);
        if (m.status === MembershipStatus.Requested && m.member_signature) {
          m.org_signature = this.signAsOrg(org.id, this.joinBody(m));
          m.status = MembershipStatus.Active;
          m.updated_at = this.iso();
          const att = this.assembleJoinAttestation(org, m);
          att.consensus_ref = proposal.id;
          m.join_attestation = att;
          await this.storage.saveMembership(m);
        }
        break;
      }
      case ProposalKind.RemoveMember: {
        const m = await this.requireSubject(proposal.subject_membership_id, org.id);
        await this.storage.saveMembership({
          ...m,
          status: MembershipStatus.Revoked,
          updated_at: this.iso(),
        });
        break;
      }
      case ProposalKind.ChangeRole: {
        const m = await this.requireSubject(proposal.subject_membership_id, org.id);
        const role = (proposal.payload as { role?: OrgRole })?.role;
        if (role) {
          await this.storage.saveMembership({ ...m, role, updated_at: this.iso() });
        }
        break;
      }
      case ProposalKind.UpdateGovernance: {
        const patch = proposal.payload as Partial<OrgGovernancePolicy>;
        const governance: OrgGovernancePolicy = { ...org.governance, ...patch };
        this.validateGovernance(governance);
        await this.storage.saveOrg({ ...org, governance, updated_at: this.iso() });
        break;
      }
      case ProposalKind.Custom:
        break;
    }
  }

  private async transition(
    membershipId: MembershipId,
    status: MembershipStatus,
    event: OrgAuditEvent['type']
  ): Promise<OrgMembership> {
    const m = await this.mustGetMembership(membershipId);
    if (m.role === OrgRole.Owner && status === MembershipStatus.Revoked) {
      throw new OrgError('The owner membership cannot be revoked', OrgErrorCode.NotAuthorized);
    }
    const next: OrgMembership = { ...m, status, updated_at: this.iso() };
    await this.storage.saveMembership(next);
    await this.emit(event, m.org_id, { membership_id: membershipId, status });
    return next;
  }

  // ---------------------------------------------------------------------------
  // Internal — signing, bodies, lookups, validation
  // ---------------------------------------------------------------------------

  /** Canonical body both parties sign for a join pact. */
  private joinBody(m: {
    org_id: OrganisationId;
    id: MembershipId;
    member_id: MemberId;
    entity_id: EntityId;
    entity_pub: string;
    role: OrgRole;
    attestation_issued_at?: string;
  }): Uint8Array {
    return canonicalJsonBytes({
      domain: PACT_JOIN_DOMAIN,
      org_id: m.org_id,
      membership_id: m.id,
      member_id: m.member_id,
      entity_id: m.entity_id,
      entity_pub: m.entity_pub,
      role: m.role,
      issued_at: m.attestation_issued_at,
    });
  }

  private consensusBody(r: PactConsensusRecord): Uint8Array {
    return canonicalJsonBytes({
      domain: PACT_CONSENSUS_DOMAIN,
      proposal_id: r.proposal_id,
      org_id: r.org_id,
      reached: r.reached,
      outcome: r.outcome,
      tally: r.tally,
      decided_at: r.decided_at,
    });
  }

  private assembleJoinAttestation(org: Organisation, m: OrgMembership): OrgJoinAttestation {
    if (!m.member_signature || !m.org_signature || !m.attestation_issued_at) {
      throw new OrgError(
        'Cannot assemble join attestation before both parties have signed',
        OrgErrorCode.InvalidState
      );
    }
    return {
      org_id: org.id,
      membership_id: m.id,
      member_id: m.member_id,
      entity_id: m.entity_id,
      role: m.role,
      entity_pub: m.entity_pub,
      member_signature: m.member_signature,
      org_pub: org.key_pub,
      org_signature: m.org_signature,
      issued_at: m.attestation_issued_at,
    };
  }

  private signAsOrg(orgId: OrganisationId, body: Uint8Array): string {
    if (!this.keyManager.hasEntityKey(orgId)) {
      throw new OrgError(
        `Organisation signing key not loaded: ${orgId}`,
        OrgErrorCode.KeyNotLoaded
      );
    }
    return this.keyManager.signAsEntity(orgId, body);
  }

  /** Ensure the org's signing key is in memory (loads from storage if needed). */
  async ensureOrgKeyLoaded(orgId: OrganisationId): Promise<boolean> {
    this.requireUnlocked();
    if (this.keyManager.hasEntityKey(orgId)) return true;
    const rec = await this.storage.getOrgKey(orgId);
    if (!rec) return false;
    this.keyManager.loadEntityKey({
      entity_id: rec.org_id,
      public_key: rec.public_key,
      encrypted_secret_key: rec.encrypted_secret_key,
      nonce: rec.nonce,
      created_at: rec.created_at,
    });
    return true;
  }

  private toOrgKeyData(key: {
    entity_id: string;
    public_key: string;
    encrypted_secret_key: string;
    nonce: string;
    created_at: string;
  }): OrgKeyData {
    return {
      org_id: key.entity_id,
      public_key: key.public_key,
      encrypted_secret_key: key.encrypted_secret_key,
      nonce: key.nonce,
      created_at: key.created_at,
    };
  }

  /** Active members holding a voting role — the eligible pool for a tally. */
  private async eligibleVoters(org: Organisation): Promise<OrgMembership[]> {
    const all = await this.storage.getMembershipsByOrg(org.id);
    const roles = new Set(org.governance.voting_roles);
    return all.filter((m) => m.status === MembershipStatus.Active && roles.has(m.role));
  }

  private async requireRole(
    membershipId: MembershipId | undefined,
    orgId: OrganisationId,
    roles: OrgRole[]
  ): Promise<OrgMembership> {
    if (!membershipId) {
      throw new OrgError('An acting membership is required', OrgErrorCode.NotAuthorized);
    }
    const m = await this.mustGetMembership(membershipId);
    if (m.org_id !== orgId) {
      throw new OrgError('Acting membership belongs to a different org', OrgErrorCode.NotAuthorized);
    }
    if (m.status !== MembershipStatus.Active) {
      throw new OrgError('Acting membership is not active', OrgErrorCode.NotAuthorized);
    }
    if (!roles.includes(m.role)) {
      throw new OrgError(
        `Membership role ${m.role} not permitted for this action`,
        OrgErrorCode.NotAuthorized
      );
    }
    return m;
  }

  private async requireSubject(
    membershipId: MembershipId | undefined,
    orgId: OrganisationId
  ): Promise<OrgMembership> {
    if (!membershipId) {
      throw new OrgError('A subject membership is required', OrgErrorCode.InvalidInput);
    }
    const m = await this.mustGetMembership(membershipId);
    if (m.org_id !== orgId) {
      throw new OrgError('Subject membership belongs to a different org', OrgErrorCode.InvalidInput);
    }
    return m;
  }

  private async assertNotAlreadyMember(
    orgId: OrganisationId,
    entityId: EntityId
  ): Promise<void> {
    const existing = await this.storage.getMembershipsByOrg(orgId);
    const live = existing.find(
      (m) => m.entity_id === entityId && m.status !== MembershipStatus.Revoked
    );
    if (live) {
      throw new OrgError(
        `Entity ${entityId} already has a ${live.status} membership in ${orgId}`,
        OrgErrorCode.AlreadyMember
      );
    }
  }

  private async mustGetOrg(id: OrganisationId): Promise<Organisation> {
    const org = await this.storage.getOrg(id);
    if (!org) throw new OrgError(`Organisation not found: ${id}`, OrgErrorCode.NotFound);
    return org;
  }

  private async mustGetActiveOrg(id: OrganisationId): Promise<Organisation> {
    const org = await this.mustGetOrg(id);
    if (org.status !== OrgStatus.Active) {
      throw new OrgError(`Organisation ${id} is ${org.status}`, OrgErrorCode.InvalidState);
    }
    return org;
  }

  private async mustGetMembership(id: MembershipId): Promise<OrgMembership> {
    const m = await this.storage.getMembership(id);
    if (!m) throw new OrgError(`Membership not found: ${id}`, OrgErrorCode.MembershipNotFound);
    return m;
  }

  private async mustGetProposal(id: ProposalId): Promise<PactProposal> {
    const p = await this.storage.getProposal(id);
    if (!p) throw new OrgError(`Proposal not found: ${id}`, OrgErrorCode.ProposalNotFound);
    return p;
  }

  private requireEntityKey(entityId: EntityId): void {
    if (!this.keyManager.hasEntityKey(entityId)) {
      throw new OrgError(
        `Signing key not loaded for entity ${entityId} — load it before signing`,
        OrgErrorCode.KeyNotLoaded
      );
    }
  }

  private requireUnlocked(): void {
    if (!this.keyManager.isUnlocked()) {
      throw new OrgError('Key manager is locked', OrgErrorCode.KeyManagerLocked);
    }
  }

  private validateGovernance(g: OrgGovernancePolicy): void {
    const inRange = (n: number) => Number.isFinite(n) && n > 0 && n <= 1;
    if (!inRange(g.quorum)) {
      throw new OrgError('quorum must be in (0, 1]', OrgErrorCode.InvalidInput);
    }
    if (!inRange(g.approval_threshold)) {
      throw new OrgError('approval_threshold must be in (0, 1]', OrgErrorCode.InvalidInput);
    }
    if (!Array.isArray(g.voting_roles) || g.voting_roles.length === 0) {
      throw new OrgError('voting_roles must be a non-empty list', OrgErrorCode.InvalidInput);
    }
    if (!Number.isFinite(g.proposal_ttl_seconds) || g.proposal_ttl_seconds <= 0) {
      throw new OrgError('proposal_ttl_seconds must be positive', OrgErrorCode.InvalidInput);
    }
  }

  private validateString(value: string, field: string, maxLength: number): void {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new OrgError(`${field} is required`, OrgErrorCode.InvalidInput);
    }
    if (value.length > maxLength) {
      throw new OrgError(`${field} exceeds ${maxLength} chars`, OrgErrorCode.InvalidInput);
    }
  }

  private describeProposal(kind: ProposalKind): string {
    switch (kind) {
      case ProposalKind.AdmitMember:
        return 'Admit a member to the organisation';
      case ProposalKind.RemoveMember:
        return 'Remove a member from the organisation';
      case ProposalKind.ChangeRole:
        return 'Change a member’s role';
      case ProposalKind.UpdateGovernance:
        return 'Amend the organisation’s governance policy';
      case ProposalKind.Custom:
        return 'Custom proposal';
    }
  }

  private isExpired(proposal: PactProposal): boolean {
    return new Date(proposal.expires_at).getTime() <= this.now().getTime();
  }

  private iso(): string {
    return this.now().toISOString();
  }

  private async emit(
    type: OrgAuditEvent['type'],
    orgId: OrganisationId,
    detail: Record<string, unknown>
  ): Promise<void> {
    if (!this.onAudit) return;
    await this.onAudit({ type, org_id: orgId, at: this.iso(), detail });
  }
}
