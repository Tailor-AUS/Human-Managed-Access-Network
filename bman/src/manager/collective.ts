/**
 * Collective — the manager that turns the type model into a working,
 * constitution-governed organisation that registered identities can join.
 *
 * Responsibilities:
 *   - incorporation (org + adopted constitution + founder membership)
 *   - membership via a two-sided join pact (request→admit, invite→accept)
 *   - capital: issue / transfer shares, derive the register of holdings
 *   - governance: appoint / remove directors and officers
 *   - decisions: open / vote / finalise resolutions, weighted per the
 *     constitution's rule for the resolution's class (PACT consensus)
 *   - amend the constitution by resolution (new in-force version)
 *
 * The manager is crypto-agnostic: it signs through a {@link SignerProvider}
 * and verifies through a {@link Verifier}. It never imports a crypto library.
 */

import { randomUUID } from 'node:crypto';
import {
  assembleAttestation,
  attest,
  signEntry,
  verifyAttestation,
  type SignatureEntry,
  type Signer,
  type SignerProvider,
  type Verifier,
} from '../crypto/signer.js';
import { canonicalBytes, sha256Hex } from '../crypto/canonical.js';
import type { Id, Money } from '../types/common.js';
import { LegalForm, OrgStatus } from '../types/legal-form.js';
import type { Organisation } from '../types/organisation.js';
import { OfficeType, OrgRole } from '../types/governance.js';
import type { DirectorAppointment, OfficerAppointment } from '../types/governance.js';
import type { Holding, ShareIssue, ShareTransfer } from '../types/capital.js';
import { MembershipStatus } from '../types/membership.js';
import type { Membership } from '../types/membership.js';
import type {
  AmendConstitutionPayload,
  Constitution,
  ResolutionRule,
} from '../types/constitution.js';
import {
  ResolutionClass,
  ResolutionKind,
  ResolutionStatus,
  VotingBasis,
  type ConsensusRecord,
  type Resolution,
  type Tally,
  type Vote,
  type VoteDecision,
} from '../types/resolution.js';
import { buildConstitution } from '../constitution/templates.js';
import { isCarried, isDecided, tally, VOTE_DECISIONS } from '../consensus/tally.js';
import type { CollectiveStorage } from './storage.js';

const D_JOIN = 'pact.join';
const D_VOTE = 'pact.vote';
const D_CONSENSUS = 'pact.consensus';
const D_CONSTITUTION = 'pact.constitution';
const D_CERTIFICATE = 'pact.share.certificate';
const D_DIRECTOR = 'pact.appointment.director';
const D_OFFICER = 'pact.appointment.officer';

const ADMIN_ROLES = [OrgRole.Founder, OrgRole.Director, OrgRole.Chair, OrgRole.ManagingDirector];

export enum CollectiveErrorCode {
  NotFound = 'NOT_FOUND',
  MembershipNotFound = 'MEMBERSHIP_NOT_FOUND',
  ResolutionNotFound = 'RESOLUTION_NOT_FOUND',
  ConstitutionNotFound = 'CONSTITUTION_NOT_FOUND',
  AlreadyMember = 'ALREADY_MEMBER',
  NotAuthorized = 'NOT_AUTHORIZED',
  NotEligible = 'NOT_ELIGIBLE',
  InvalidState = 'INVALID_STATE',
  InvalidInput = 'INVALID_INPUT',
  SignerUnavailable = 'SIGNER_UNAVAILABLE',
  DuplicateVote = 'DUPLICATE_VOTE',
  ConsensusNotReached = 'CONSENSUS_NOT_REACHED',
  InsufficientShares = 'INSUFFICIENT_SHARES',
  UnknownShareClass = 'UNKNOWN_SHARE_CLASS',
}

export class CollectiveError extends Error {
  constructor(message: string, readonly code: CollectiveErrorCode) {
    super(message);
    this.name = 'CollectiveError';
  }
}

export interface CollectiveConfig {
  storage: CollectiveStorage;
  signers: SignerProvider;
  verifier: Verifier;
  now?: () => Date;
}

export interface IncorporateInput {
  legal_form: LegalForm;
  legal_name: string;
  jurisdiction?: string;
  registered_number?: string;
  registered_office?: string;
  /** Key id for the organisation's own signing key (must exist in the provider). */
  org_signing_key_id: string;
  org_public_key: string;
  /** Founder identity. */
  founder_member_ref: string;
  founder_display_name?: string;
  founder_signing_key_id: string;
  founder_public_key: string;
  founder_roles?: OrgRole[];
  /** Shares to allot to the founder on formation (share forms only). */
  initial_shares?: { class_code: string; quantity: number; consideration?: Money };
  trading_names?: string[];
  metadata?: Record<string, string>;
}

export interface JoinRequestInput {
  org_id: Id;
  member_ref: string;
  display_name?: string;
  signing_key_id: string;
  public_key: string;
  roles?: OrgRole[];
}

export interface InviteInput {
  org_id: Id;
  inviter_membership_id: Id;
  member_ref: string;
  display_name?: string;
  signing_key_id: string;
  public_key: string;
  roles?: OrgRole[];
}

export interface OpenResolutionInput<TPayload = unknown> {
  org_id: Id;
  proposed_by: Id;
  kind: ResolutionKind;
  class?: ResolutionClass;
  subject_membership_id?: Id;
  payload?: TPayload;
  description?: string;
  ttl_seconds?: number;
}

export class Collective {
  private storage: CollectiveStorage;
  private signers: SignerProvider;
  private verifier: Verifier;
  private now: () => Date;

  constructor(config: CollectiveConfig) {
    this.storage = config.storage;
    this.signers = config.signers;
    this.verifier = config.verifier;
    this.now = config.now ?? (() => new Date());
  }

  // ===========================================================================
  // Incorporation
  // ===========================================================================

  async incorporate(input: IncorporateInput): Promise<{
    organisation: Organisation;
    constitution: Constitution;
    founderMembership: Membership;
  }> {
    this.req(input.legal_name, 'legal_name');
    this.req(input.org_public_key, 'org_public_key');
    const orgSigner = await this.requireSigner(input.org_signing_key_id);
    const founderSigner = await this.requireSigner(input.founder_signing_key_id);

    const orgId = randomUUID();
    const nowIso = this.iso();

    // Adopt the constitution for the chosen legal form.
    const constitution = buildConstitution({
      id: randomUUID(),
      org_id: orgId,
      legal_form: input.legal_form,
      name: input.legal_name,
    });
    constitution.status = 'in_force';
    constitution.adopted_at = nowIso;
    constitution.adoption_attestation = await attest(
      D_CONSTITUTION,
      this.constitutionBody(constitution),
      [{ signer: orgSigner, capacity: 'organisation' }],
      nowIso
    );

    const organisation: Organisation = {
      id: orgId,
      legal_form: input.legal_form,
      legal_name: input.legal_name,
      trading_names: input.trading_names,
      jurisdiction: input.jurisdiction,
      registered_number: input.registered_number,
      registered_office: input.registered_office,
      signing_key_id: input.org_signing_key_id,
      public_key: input.org_public_key,
      status: OrgStatus.Active,
      constitution_id: constitution.id,
      constitution_version: constitution.version,
      founded_at: nowIso,
      updated_at: nowIso,
      metadata: input.metadata,
    };

    await this.storage.saveOrg(organisation);
    await this.storage.saveConstitution(constitution);

    // Founder membership — admitted immediately, both parties sign.
    const hasShares = constitution.share_classes.length > 0;
    const founderRoles =
      input.founder_roles ??
      (hasShares
        ? [OrgRole.Founder, OrgRole.Director, OrgRole.Shareholder]
        : [OrgRole.Founder, OrgRole.Director, OrgRole.Member]);

    const founder: Membership = {
      id: randomUUID(),
      org_id: orgId,
      member_ref: input.founder_member_ref,
      display_name: input.founder_display_name,
      signing_key_id: input.founder_signing_key_id,
      public_key: input.founder_public_key,
      roles: founderRoles,
      status: MembershipStatus.Active,
      created_at: nowIso,
      updated_at: nowIso,
      joined_at: nowIso,
      pact_roles: founderRoles,
      attestation_issued_at: nowIso,
    };
    const body = this.joinBody(founder);
    const memberEntry = (await signEntry(D_JOIN, body, founderSigner, 'member')).entry;
    const orgEntry = (await signEntry(D_JOIN, body, orgSigner, 'organisation')).entry;
    founder.join_attestation = assembleAttestation(D_JOIN, body, [memberEntry, orgEntry], nowIso);
    await this.storage.saveMembership(founder);

    if (hasShares && input.initial_shares) {
      await this.issueSharesInternal(
        organisation,
        constitution,
        founder.id,
        input.initial_shares.class_code,
        input.initial_shares.quantity,
        input.initial_shares.consideration,
        undefined
      );
    }

    return { organisation, constitution, founderMembership: founder };
  }

  // ===========================================================================
  // Membership — join pact
  // ===========================================================================

  async requestToJoin(input: JoinRequestInput): Promise<Membership> {
    const org = await this.requireActiveOrg(input.org_id);
    await this.assertNotMember(org.id, input.member_ref);
    const signer = await this.requireSigner(input.signing_key_id);

    const nowIso = this.iso();
    const roles = input.roles ?? [OrgRole.Member];
    const m: Membership = {
      id: randomUUID(),
      org_id: org.id,
      member_ref: input.member_ref,
      display_name: input.display_name,
      signing_key_id: input.signing_key_id,
      public_key: input.public_key,
      roles,
      status: MembershipStatus.Requested,
      created_at: nowIso,
      updated_at: nowIso,
      pact_roles: roles,
      attestation_issued_at: nowIso,
    };
    m.pending_signatures = [(await signEntry(D_JOIN, this.joinBody(m), signer, 'member')).entry];
    await this.storage.saveMembership(m);
    return m;
  }

  async inviteMember(input: InviteInput): Promise<Membership> {
    const org = await this.requireActiveOrg(input.org_id);
    await this.requireAdmin(input.inviter_membership_id, org.id);
    await this.assertNotMember(org.id, input.member_ref);
    const orgSigner = await this.requireSigner(org.signing_key_id);

    const nowIso = this.iso();
    const roles = input.roles ?? [OrgRole.Member];
    const m: Membership = {
      id: randomUUID(),
      org_id: org.id,
      member_ref: input.member_ref,
      display_name: input.display_name,
      signing_key_id: input.signing_key_id,
      public_key: input.public_key,
      roles,
      status: MembershipStatus.Invited,
      created_at: nowIso,
      updated_at: nowIso,
      invited_by: input.inviter_membership_id,
      pact_roles: roles,
      attestation_issued_at: nowIso,
    };
    m.pending_signatures = [(await signEntry(D_JOIN, this.joinBody(m), orgSigner, 'organisation')).entry];
    await this.storage.saveMembership(m);
    return m;
  }

  /** The invited identity accepts: signs its side, completing the pact. */
  async acceptInvite(membershipId: Id): Promise<Membership> {
    const m = await this.requireMembership(membershipId);
    if (m.status !== MembershipStatus.Invited) {
      throw new CollectiveError('membership is not awaiting acceptance', CollectiveErrorCode.InvalidState);
    }
    const signer = await this.requireSigner(m.signing_key_id);
    const entry = (await signEntry(D_JOIN, this.joinBody(m), signer, 'member')).entry;
    return this.completeJoin(m, entry);
  }

  /** Directly admit a requester (admin path). For constitutions that require a
   *  vote, open an {@link ResolutionKind.AdmitMember} resolution instead. */
  async admitMember(membershipId: Id, actingMembershipId: Id): Promise<Membership> {
    const m = await this.requireMembership(membershipId);
    if (m.status !== MembershipStatus.Requested) {
      throw new CollectiveError('membership is not pending admission', CollectiveErrorCode.InvalidState);
    }
    const org = await this.requireOrg(m.org_id);
    await this.requireAdmin(actingMembershipId, org.id);
    const orgSigner = await this.requireSigner(org.signing_key_id);
    const entry = (await signEntry(D_JOIN, this.joinBody(m), orgSigner, 'organisation')).entry;
    return this.completeJoin(m, entry);
  }

  // ===========================================================================
  // Capital — shares
  // ===========================================================================

  async issueShares(
    orgId: Id,
    holderMembershipId: Id,
    classCode: string,
    quantity: number,
    actingMembershipId: Id,
    consideration?: Money
  ): Promise<ShareIssue> {
    const org = await this.requireActiveOrg(orgId);
    await this.requireAdmin(actingMembershipId, orgId);
    const constitution = await this.requireConstitution(org);
    return this.issueSharesInternal(org, constitution, holderMembershipId, classCode, quantity, consideration, undefined);
  }

  async transferShares(
    orgId: Id,
    fromMembershipId: Id,
    toMembershipId: Id,
    classCode: string,
    quantity: number,
    actingMembershipId: Id,
    consideration?: Money
  ): Promise<ShareTransfer> {
    const org = await this.requireActiveOrg(orgId);
    // The transferor or an administrator may execute the transfer.
    if (actingMembershipId !== fromMembershipId) {
      await this.requireAdmin(actingMembershipId, orgId);
    } else {
      await this.requireMembership(fromMembershipId);
    }
    return this.transferSharesInternal(org, fromMembershipId, toMembershipId, classCode, quantity, consideration, undefined);
  }

  /** Net holdings for one member. */
  async holdingsOf(orgId: Id, membershipId: Id): Promise<Holding[]> {
    const all = await this.shareRegister(orgId);
    return all.filter((h) => h.membership_id === membershipId);
  }

  /** Full share register: net position per member per class (non-zero only). */
  async shareRegister(orgId: Id): Promise<Holding[]> {
    const issues = await this.storage.getShareIssuesByOrg(orgId);
    const transfers = await this.storage.getShareTransfersByOrg(orgId);
    const map = new Map<string, Holding>();
    const key = (m: Id, c: string) => `${m}::${c}`;
    const bump = (m: Id, c: string, q: number) => {
      const k = key(m, c);
      const cur = map.get(k) ?? { membership_id: m, class_code: c, quantity: 0 };
      cur.quantity += q;
      map.set(k, cur);
    };
    for (const i of issues) bump(i.holder_membership_id, i.class_code, i.quantity);
    for (const t of transfers) {
      bump(t.from_membership_id, t.class_code, -t.quantity);
      bump(t.to_membership_id, t.class_code, t.quantity);
    }
    return [...map.values()].filter((h) => h.quantity !== 0);
  }

  // ===========================================================================
  // Governance — directors & officers
  // ===========================================================================

  async appointDirector(
    orgId: Id,
    membershipId: Id,
    title: 'director' | 'chair' | 'managing_director',
    actingMembershipId: Id
  ): Promise<DirectorAppointment> {
    const org = await this.requireActiveOrg(orgId);
    await this.requireAdmin(actingMembershipId, orgId);
    return this.appointDirectorInternal(org, membershipId, title, undefined);
  }

  async appointOfficer(
    orgId: Id,
    membershipId: Id,
    office: OfficeType,
    actingMembershipId: Id
  ): Promise<OfficerAppointment> {
    const org = await this.requireActiveOrg(orgId);
    await this.requireAdmin(actingMembershipId, orgId);
    return this.appointOfficerInternal(org, membershipId, office, undefined);
  }

  async registerOfDirectors(orgId: Id): Promise<DirectorAppointment[]> {
    return (await this.storage.getDirectorAppointmentsByOrg(orgId)).filter((a) => !a.ceased_at);
  }

  async registerOfOfficers(orgId: Id): Promise<OfficerAppointment[]> {
    return (await this.storage.getOfficerAppointmentsByOrg(orgId)).filter((a) => !a.ceased_at);
  }

  // ===========================================================================
  // Resolutions — PACT consensus
  // ===========================================================================

  async openResolution<TPayload = unknown>(
    input: OpenResolutionInput<TPayload>
  ): Promise<Resolution<TPayload>> {
    const org = await this.requireActiveOrg(input.org_id);
    const constitution = await this.requireConstitution(org);
    const cls = input.class ?? this.defaultClass(input.kind, constitution);
    const rule = constitution.resolution_rules[cls];
    await this.requireVoter(input.proposed_by, org.id, rule);

    if (input.kind === ResolutionKind.AdmitMember) {
      const subject = await this.requireSubject(input.subject_membership_id, org.id);
      if (subject.status !== MembershipStatus.Requested) {
        throw new CollectiveError('admit subject must be a requested membership', CollectiveErrorCode.InvalidState);
      }
    }

    const now = this.now();
    const ttl = input.ttl_seconds ?? 7 * 24 * 60 * 60;
    const resolution: Resolution<TPayload> = {
      id: randomUUID(),
      org_id: org.id,
      kind: input.kind,
      class: cls,
      proposed_by: input.proposed_by,
      subject_membership_id: input.subject_membership_id,
      payload: (input.payload ?? {}) as TPayload,
      description: input.description ?? this.describe(input.kind),
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + ttl * 1000).toISOString(),
      status: ResolutionStatus.Open,
    };
    await this.storage.saveResolution(resolution as Resolution);
    return resolution;
  }

  async castVote(
    resolutionId: Id,
    voterMembershipId: Id,
    decision: VoteDecision
  ): Promise<Resolution> {
    if (!VOTE_DECISIONS.includes(decision)) {
      throw new CollectiveError(`invalid decision: ${decision}`, CollectiveErrorCode.InvalidInput);
    }
    const resolution = await this.requireResolution(resolutionId);
    if (resolution.status !== ResolutionStatus.Open) {
      throw new CollectiveError('resolution is not open', CollectiveErrorCode.InvalidState);
    }
    const org = await this.requireOrg(resolution.org_id);
    const constitution = await this.requireConstitution(org);
    const rule = constitution.resolution_rules[resolution.class];

    if (this.expired(resolution)) {
      await this.finalize(resolution, org, constitution, rule);
      throw new CollectiveError('resolution has expired', CollectiveErrorCode.InvalidState);
    }

    const voter = await this.requireVoter(voterMembershipId, org.id, rule);
    const weight = await this.weightOf(voter, org, constitution, rule);
    if (weight <= 0) {
      throw new CollectiveError('voter carries no voting weight for this resolution', CollectiveErrorCode.NotEligible);
    }

    const existing = await this.storage.getVotes(resolution.id);
    if (existing.some((v) => v.voter_membership_id === voter.id)) {
      throw new CollectiveError('member has already voted', CollectiveErrorCode.DuplicateVote);
    }

    const signer = await this.requireSigner(voter.signing_key_id);
    const cast_at = this.iso();
    const body = this.voteBody(resolution.id, voter, decision, weight, cast_at);
    const vote: Vote = {
      resolution_id: resolution.id,
      voter_membership_id: voter.id,
      voter_public_key: voter.public_key,
      decision,
      weight,
      signature: await signer.sign(canonicalBytes({ domain: D_VOTE, body })),
      cast_at,
    };
    await this.storage.saveVote(vote);

    // Auto-finalise once the whole eligible pool has voted.
    const eligible = await this.eligibleVoters(org, constitution, rule);
    const votes = await this.storage.getVotes(resolution.id);
    if (votes.length >= eligible.length) {
      return this.finalize(resolution, org, constitution, rule);
    }
    return resolution;
  }

  /** Tally a resolution without mutating it. */
  async tallyResolution(resolutionId: Id): Promise<Tally> {
    const resolution = await this.requireResolution(resolutionId);
    const org = await this.requireOrg(resolution.org_id);
    const constitution = await this.requireConstitution(org);
    const rule = constitution.resolution_rules[resolution.class];
    const eligible = await this.eligibleVoters(org, constitution, rule);
    const weight = eligible.reduce((s, e) => s + e.weight, 0);
    const votes = await this.storage.getVotes(resolutionId);
    return tally(votes, weight, rule);
  }

  /** Close a resolution now (once quorum met, or once expired). */
  async finalizeResolution(resolutionId: Id): Promise<Resolution> {
    const resolution = await this.requireResolution(resolutionId);
    if (resolution.status !== ResolutionStatus.Open) return resolution;
    const org = await this.requireOrg(resolution.org_id);
    const constitution = await this.requireConstitution(org);
    const rule = constitution.resolution_rules[resolution.class];

    const eligible = await this.eligibleVoters(org, constitution, rule);
    const votes = await this.storage.getVotes(resolution.id);
    const t = tally(votes, eligible.reduce((s, e) => s + e.weight, 0), rule);
    const allVoted = votes.length >= eligible.length;
    if (!this.expired(resolution) && !isDecided(t, allVoted)) {
      throw new CollectiveError('quorum not reached and not expired', CollectiveErrorCode.ConsensusNotReached);
    }
    return this.finalize(resolution, org, constitution, rule);
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  getOrganisation(id: Id): Promise<Organisation | null> {
    return this.storage.getOrg(id);
  }
  getConstitution(id: Id): Promise<Constitution | null> {
    return this.storage.getConstitution(id);
  }
  async constitutionInForce(orgId: Id): Promise<Constitution | null> {
    const all = await this.storage.getConstitutionsByOrg(orgId);
    return all.find((c) => c.status === 'in_force') ?? null;
  }
  registerOfMembers(orgId: Id): Promise<Membership[]> {
    return this.storage.getMembershipsByOrg(orgId);
  }
  getMembership(id: Id): Promise<Membership | null> {
    return this.storage.getMembership(id);
  }
  getResolution(id: Id): Promise<Resolution | null> {
    return this.storage.getResolution(id);
  }
  registerOfResolutions(orgId: Id): Promise<Resolution[]> {
    return this.storage.getResolutionsByOrg(orgId);
  }
  getVotes(resolutionId: Id): Promise<Vote[]> {
    return this.storage.getVotes(resolutionId);
  }

  // ===========================================================================
  // Verification
  // ===========================================================================

  /** Verify a membership's two-sided join pact. */
  async verifyMembership(membershipId: Id): Promise<boolean> {
    const m = await this.storage.getMembership(membershipId);
    if (!m || !m.join_attestation) return false;
    return verifyAttestation(D_JOIN, this.joinBody(m), m.join_attestation, this.verifier, [
      'member',
      'organisation',
    ]);
  }

  /** Verify the org-sealed consensus record of a resolution. */
  async verifyConsensus(resolutionId: Id): Promise<boolean> {
    const r = await this.storage.getResolution(resolutionId);
    if (!r || !r.consensus) return false;
    return verifyAttestation(D_CONSENSUS, this.consensusBody(r.consensus), r.consensus.seal, this.verifier, [
      'organisation',
    ]);
  }

  /** Verify the constitution's org-signed adoption attestation. */
  async verifyConstitution(constitutionId: Id): Promise<boolean> {
    const c = await this.storage.getConstitution(constitutionId);
    if (!c || !c.adoption_attestation) return false;
    return verifyAttestation(D_CONSTITUTION, this.constitutionBody(c), c.adoption_attestation, this.verifier, [
      'organisation',
    ]);
  }

  // ===========================================================================
  // Internal — effecting changes (shared by direct methods and resolutions)
  // ===========================================================================

  private async completeJoin(m: Membership, entry: SignatureEntry): Promise<Membership> {
    const sigs = [...(m.pending_signatures ?? []), entry];
    const haveMember = sigs.some((s) => s.capacity === 'member');
    const haveOrg = sigs.some((s) => s.capacity === 'organisation');
    m.pending_signatures = sigs;
    m.updated_at = this.iso();
    if (haveMember && haveOrg) {
      m.join_attestation = assembleAttestation(
        D_JOIN,
        this.joinBody(m),
        sigs,
        m.attestation_issued_at ?? this.iso()
      );
      m.status = MembershipStatus.Active;
      m.joined_at = this.iso();
    }
    await this.storage.saveMembership(m);
    return m;
  }

  private async issueSharesInternal(
    org: Organisation,
    constitution: Constitution,
    holderMembershipId: Id,
    classCode: string,
    quantity: number,
    consideration: Money | undefined,
    resolutionRef: Id | undefined
  ): Promise<ShareIssue> {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new CollectiveError('quantity must be a positive integer', CollectiveErrorCode.InvalidInput);
    }
    const cls = constitution.share_classes.find((s) => s.code === classCode);
    if (!cls) throw new CollectiveError(`unknown share class: ${classCode}`, CollectiveErrorCode.UnknownShareClass);
    await this.requireMembership(holderMembershipId);

    if (cls.authorised !== undefined) {
      const issued = (await this.storage.getShareIssuesByOrg(org.id))
        .filter((i) => i.class_code === classCode)
        .reduce((s, i) => s + i.quantity, 0);
      if (issued + quantity > cls.authorised) {
        throw new CollectiveError('issue exceeds authorised capital', CollectiveErrorCode.InvalidState);
      }
    }

    const nowIso = this.iso();
    const orgSigner = await this.requireSigner(org.signing_key_id);
    const issue: ShareIssue = {
      id: randomUUID(),
      org_id: org.id,
      class_code: classCode,
      holder_membership_id: holderMembershipId,
      quantity,
      consideration,
      issued_at: nowIso,
      resolution_ref: resolutionRef,
    };
    issue.certificate = await attest(
      D_CERTIFICATE,
      { org_id: org.id, issue_id: issue.id, class_code: classCode, holder: holderMembershipId, quantity },
      [{ signer: orgSigner, capacity: 'organisation' }],
      nowIso
    );
    await this.storage.saveShareIssue(issue);
    await this.ensureShareholderRole(holderMembershipId);
    return issue;
  }

  private async transferSharesInternal(
    org: Organisation,
    fromMembershipId: Id,
    toMembershipId: Id,
    classCode: string,
    quantity: number,
    consideration: Money | undefined,
    resolutionRef: Id | undefined
  ): Promise<ShareTransfer> {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new CollectiveError('quantity must be a positive integer', CollectiveErrorCode.InvalidInput);
    }
    await this.requireMembership(toMembershipId);
    const held = (await this.holdingsOf(org.id, fromMembershipId)).find((h) => h.class_code === classCode);
    if (!held || held.quantity < quantity) {
      throw new CollectiveError('transferor holds insufficient shares', CollectiveErrorCode.InsufficientShares);
    }
    const transfer: ShareTransfer = {
      id: randomUUID(),
      org_id: org.id,
      class_code: classCode,
      from_membership_id: fromMembershipId,
      to_membership_id: toMembershipId,
      quantity,
      consideration,
      transferred_at: this.iso(),
      resolution_ref: resolutionRef,
    };
    await this.storage.saveShareTransfer(transfer);
    await this.ensureShareholderRole(toMembershipId);
    return transfer;
  }

  private async appointDirectorInternal(
    org: Organisation,
    membershipId: Id,
    title: 'director' | 'chair' | 'managing_director',
    resolutionRef: Id | undefined
  ): Promise<DirectorAppointment> {
    const m = await this.requireMembership(membershipId);
    const nowIso = this.iso();
    const orgSigner = await this.requireSigner(org.signing_key_id);
    const appointment: DirectorAppointment = {
      id: randomUUID(),
      org_id: org.id,
      membership_id: membershipId,
      title,
      appointed_at: nowIso,
      resolution_ref: resolutionRef,
    };
    appointment.attestation = await attest(
      D_DIRECTOR,
      { org_id: org.id, appointment_id: appointment.id, membership_id: membershipId, title },
      [{ signer: orgSigner, capacity: 'organisation' }],
      nowIso
    );
    await this.storage.saveDirectorAppointment(appointment);

    const role = title === 'chair' ? OrgRole.Chair : title === 'managing_director' ? OrgRole.ManagingDirector : OrgRole.Director;
    await this.addRoles(m, [OrgRole.Director, role]);
    return appointment;
  }

  private async appointOfficerInternal(
    org: Organisation,
    membershipId: Id,
    office: OfficeType,
    resolutionRef: Id | undefined
  ): Promise<OfficerAppointment> {
    const m = await this.requireMembership(membershipId);
    const nowIso = this.iso();
    const orgSigner = await this.requireSigner(org.signing_key_id);
    const appointment: OfficerAppointment = {
      id: randomUUID(),
      org_id: org.id,
      membership_id: membershipId,
      office,
      appointed_at: nowIso,
      resolution_ref: resolutionRef,
    };
    appointment.attestation = await attest(
      D_OFFICER,
      { org_id: org.id, appointment_id: appointment.id, membership_id: membershipId, office },
      [{ signer: orgSigner, capacity: 'organisation' }],
      nowIso
    );
    await this.storage.saveOfficerAppointment(appointment);
    await this.addRoles(m, office === OfficeType.Secretary ? [OrgRole.Officer, OrgRole.Secretary] : [OrgRole.Officer]);
    return appointment;
  }

  private async finalize(
    resolution: Resolution,
    org: Organisation,
    constitution: Constitution,
    rule: ResolutionRule
  ): Promise<Resolution> {
    const eligible = await this.eligibleVoters(org, constitution, rule);
    const votes = await this.storage.getVotes(resolution.id);
    const t = tally(votes, eligible.reduce((s, e) => s + e.weight, 0), rule);
    const allVoted = votes.length >= eligible.length;
    const decided = isDecided(t, allVoted) || this.expired(resolution);

    const carried = decided ? isCarried(t, rule) : false;
    const decidedAt = this.iso();
    const orgSigner = await this.requireSigner(org.signing_key_id);

    const record: ConsensusRecord = {
      resolution_id: resolution.id,
      org_id: org.id,
      class: resolution.class,
      carried,
      tally: t,
      decided_at: decidedAt,
      seal: { domain: D_CONSENSUS, hash: '', signatures: [], issued_at: decidedAt },
    };
    record.seal = await attest(
      D_CONSENSUS,
      this.consensusBody(record),
      [{ signer: orgSigner, capacity: 'organisation' }],
      decidedAt
    );

    resolution.consensus = record;
    resolution.status = carried
      ? ResolutionStatus.Carried
      : this.expired(resolution) && !t.quorum_met
        ? ResolutionStatus.Lapsed
        : ResolutionStatus.NotCarried;
    await this.storage.saveResolution(resolution);

    if (carried) {
      await this.applyEffect(resolution, org, constitution);
    }
    return resolution;
  }

  private async applyEffect(
    resolution: Resolution,
    org: Organisation,
    constitution: Constitution
  ): Promise<void> {
    switch (resolution.kind) {
      case ResolutionKind.AdmitMember: {
        const m = await this.requireSubject(resolution.subject_membership_id, org.id);
        if (m.status === MembershipStatus.Requested) {
          const orgSigner = await this.requireSigner(org.signing_key_id);
          const entry = (await signEntry(D_JOIN, this.joinBody(m), orgSigner, 'organisation')).entry;
          await this.completeJoin(m, entry);
        }
        break;
      }
      case ResolutionKind.RemoveMember: {
        const m = await this.requireSubject(resolution.subject_membership_id, org.id);
        await this.setStatus(m, MembershipStatus.Ceased);
        break;
      }
      case ResolutionKind.ChangeRoles: {
        const m = await this.requireSubject(resolution.subject_membership_id, org.id);
        const roles = (resolution.payload as { roles?: OrgRole[] }).roles;
        if (roles && roles.length) {
          await this.storage.saveMembership({ ...m, roles, updated_at: this.iso() });
        }
        break;
      }
      case ResolutionKind.AppointDirector: {
        const m = await this.requireSubject(resolution.subject_membership_id, org.id);
        const title = (resolution.payload as { title?: 'director' | 'chair' | 'managing_director' }).title ?? 'director';
        await this.appointDirectorInternal(org, m.id, title, resolution.id);
        break;
      }
      case ResolutionKind.RemoveDirector: {
        const m = await this.requireSubject(resolution.subject_membership_id, org.id);
        await this.ceaseDirectors(org.id, m.id);
        await this.removeRoles(m, [OrgRole.Director, OrgRole.Chair, OrgRole.ManagingDirector]);
        break;
      }
      case ResolutionKind.AppointOfficer: {
        const m = await this.requireSubject(resolution.subject_membership_id, org.id);
        const office = (resolution.payload as { office?: string }).office as OfficeType;
        if (office) await this.appointOfficerInternal(org, m.id, office, resolution.id);
        break;
      }
      case ResolutionKind.IssueShares: {
        const m = await this.requireSubject(resolution.subject_membership_id, org.id);
        const p = resolution.payload as { class_code?: string; quantity?: number };
        if (p.class_code && p.quantity) {
          await this.issueSharesInternal(org, constitution, m.id, p.class_code, p.quantity, undefined, resolution.id);
        }
        break;
      }
      case ResolutionKind.TransferShares: {
        const from = await this.requireSubject(resolution.subject_membership_id, org.id);
        const p = resolution.payload as { class_code?: string; to_membership_id?: Id; quantity?: number };
        if (p.class_code && p.to_membership_id && p.quantity) {
          await this.transferSharesInternal(org, from.id, p.to_membership_id, p.class_code, p.quantity, undefined, resolution.id);
        }
        break;
      }
      case ResolutionKind.AmendConstitution: {
        await this.amendConstitution(org, constitution, resolution.payload as AmendConstitutionPayload, resolution.id);
        break;
      }
      case ResolutionKind.Dissolve: {
        await this.storage.saveOrg({ ...org, status: OrgStatus.Dissolved, updated_at: this.iso() });
        break;
      }
      case ResolutionKind.DeclareDividend:
      case ResolutionKind.RemoveOfficer:
      case ResolutionKind.Custom:
        break;
    }
  }

  private async amendConstitution(
    org: Organisation,
    current: Constitution,
    patch: AmendConstitutionPayload,
    _resolutionRef: Id
  ): Promise<Constitution> {
    const nowIso = this.iso();
    await this.storage.saveConstitution({ ...current, status: 'superseded', superseded_at: nowIso });

    const next: Constitution = {
      ...current,
      id: randomUUID(),
      version: current.version + 1,
      status: 'in_force',
      clauses: patch.clauses ?? current.clauses,
      share_classes: patch.share_classes ?? current.share_classes,
      resolution_rules: patch.resolution_rules
        ? { ...current.resolution_rules, ...patch.resolution_rules }
        : current.resolution_rules,
      adopted_at: nowIso,
      superseded_at: undefined,
      adoption_attestation: undefined,
    };
    const orgSigner = await this.requireSigner(org.signing_key_id);
    next.adoption_attestation = await attest(
      D_CONSTITUTION,
      this.constitutionBody(next),
      [{ signer: orgSigner, capacity: 'organisation' }],
      nowIso
    );
    await this.storage.saveConstitution(next);
    await this.storage.saveOrg({
      ...org,
      constitution_id: next.id,
      constitution_version: next.version,
      updated_at: nowIso,
    });
    return next;
  }

  // ===========================================================================
  // Internal — eligibility & weighting
  // ===========================================================================

  private async eligibleVoters(
    org: Organisation,
    constitution: Constitution,
    rule: ResolutionRule
  ): Promise<Array<{ membership: Membership; weight: number }>> {
    const members = (await this.storage.getMembershipsByOrg(org.id)).filter(
      (m) => m.status === MembershipStatus.Active
    );
    const roles = new Set(rule.voter_roles);
    const out: Array<{ membership: Membership; weight: number }> = [];
    for (const m of members) {
      if (!m.roles.some((r) => roles.has(r))) continue;
      const weight = await this.weightOf(m, org, constitution, rule);
      if (weight > 0) out.push({ membership: m, weight });
    }
    return out;
  }

  private async weightOf(
    m: Membership,
    org: Organisation,
    constitution: Constitution,
    rule: ResolutionRule
  ): Promise<number> {
    if (rule.basis === VotingBasis.PerCapita || rule.basis === VotingBasis.Board) {
      return 1;
    }
    // PerShare: sum of (shares held * votes per share) across classes.
    const holdings = await this.holdingsOf(org.id, m.id);
    let power = 0;
    for (const h of holdings) {
      const cls = constitution.share_classes.find((s) => s.code === h.class_code);
      if (cls) power += h.quantity * cls.votes_per_share;
    }
    return power;
  }

  // ===========================================================================
  // Internal — bodies, lookups, validation, small mutations
  // ===========================================================================

  private joinBody(m: {
    org_id: Id;
    id: Id;
    member_ref: string;
    public_key: string;
    pact_roles?: OrgRole[];
    attestation_issued_at?: string;
  }) {
    return {
      org_id: m.org_id,
      membership_id: m.id,
      member_ref: m.member_ref,
      public_key: m.public_key,
      roles: m.pact_roles ?? [],
      issued_at: m.attestation_issued_at,
    };
  }

  private voteBody(
    resolutionId: Id,
    voter: Membership,
    decision: VoteDecision,
    weight: number,
    castAt: string
  ) {
    return {
      resolution_id: resolutionId,
      voter_membership_id: voter.id,
      voter_public_key: voter.public_key,
      decision,
      weight,
      cast_at: castAt,
    };
  }

  private consensusBody(r: ConsensusRecord) {
    return {
      resolution_id: r.resolution_id,
      org_id: r.org_id,
      class: r.class,
      carried: r.carried,
      tally: r.tally,
      decided_at: r.decided_at,
    };
  }

  private constitutionBody(c: Constitution) {
    return {
      org_id: c.org_id,
      constitution_id: c.id,
      version: c.version,
      content_hash: sha256Hex(
        canonicalBytes({
          clauses: c.clauses,
          resolution_rules: c.resolution_rules,
          share_classes: c.share_classes,
          amendment_rule: c.amendment_rule,
        })
      ),
    };
  }

  private defaultClass(kind: ResolutionKind, constitution: Constitution): ResolutionClass {
    switch (kind) {
      case ResolutionKind.AmendConstitution:
        return constitution.amendment_rule;
      case ResolutionKind.Dissolve:
        return ResolutionClass.Special;
      case ResolutionKind.RemoveMember:
      case ResolutionKind.RemoveDirector:
        return ResolutionClass.Special;
      default:
        return ResolutionClass.Ordinary;
    }
  }

  private describe(kind: ResolutionKind): string {
    return `Resolution: ${kind.replace(/_/g, ' ')}`;
  }

  private async ensureShareholderRole(membershipId: Id): Promise<void> {
    const m = await this.storage.getMembership(membershipId);
    if (m) await this.addRoles(m, [OrgRole.Shareholder]);
  }

  private async addRoles(m: Membership, roles: OrgRole[]): Promise<void> {
    const set = new Set(m.roles);
    let changed = false;
    for (const r of roles) if (!set.has(r)) { set.add(r); changed = true; }
    if (changed) await this.storage.saveMembership({ ...m, roles: [...set], updated_at: this.iso() });
  }

  private async removeRoles(m: Membership, roles: OrgRole[]): Promise<void> {
    const remove = new Set(roles);
    const next = m.roles.filter((r) => !remove.has(r));
    await this.storage.saveMembership({ ...m, roles: next, updated_at: this.iso() });
  }

  private async setStatus(m: Membership, status: MembershipStatus): Promise<void> {
    await this.storage.saveMembership({ ...m, status, updated_at: this.iso() });
  }

  private async ceaseDirectors(orgId: Id, membershipId: Id): Promise<void> {
    const appts = await this.storage.getDirectorAppointmentsByOrg(orgId);
    for (const a of appts) {
      if (a.membership_id === membershipId && !a.ceased_at) {
        await this.storage.saveDirectorAppointment({ ...a, ceased_at: this.iso() });
      }
    }
  }

  private async requireSigner(keyId: string): Promise<Signer> {
    const s = await this.signers.getSigner(keyId);
    if (!s) throw new CollectiveError(`no signer available for key ${keyId}`, CollectiveErrorCode.SignerUnavailable);
    return s;
  }

  private async requireOrg(id: Id): Promise<Organisation> {
    const o = await this.storage.getOrg(id);
    if (!o) throw new CollectiveError(`organisation not found: ${id}`, CollectiveErrorCode.NotFound);
    return o;
  }

  private async requireActiveOrg(id: Id): Promise<Organisation> {
    const o = await this.requireOrg(id);
    if (o.status !== OrgStatus.Active) {
      throw new CollectiveError(`organisation is ${o.status}`, CollectiveErrorCode.InvalidState);
    }
    return o;
  }

  private async requireConstitution(org: Organisation): Promise<Constitution> {
    const c = org.constitution_id ? await this.storage.getConstitution(org.constitution_id) : null;
    if (!c) throw new CollectiveError('no constitution in force', CollectiveErrorCode.ConstitutionNotFound);
    return c;
  }

  private async requireMembership(id: Id): Promise<Membership> {
    const m = await this.storage.getMembership(id);
    if (!m) throw new CollectiveError(`membership not found: ${id}`, CollectiveErrorCode.MembershipNotFound);
    return m;
  }

  private async requireResolution(id: Id): Promise<Resolution> {
    const r = await this.storage.getResolution(id);
    if (!r) throw new CollectiveError(`resolution not found: ${id}`, CollectiveErrorCode.ResolutionNotFound);
    return r;
  }

  private async requireSubject(id: Id | undefined, orgId: Id): Promise<Membership> {
    if (!id) throw new CollectiveError('subject membership required', CollectiveErrorCode.InvalidInput);
    const m = await this.requireMembership(id);
    if (m.org_id !== orgId) throw new CollectiveError('subject belongs to another org', CollectiveErrorCode.InvalidInput);
    return m;
  }

  private async requireAdmin(membershipId: Id, orgId: Id): Promise<Membership> {
    const m = await this.requireMembership(membershipId);
    if (m.org_id !== orgId || m.status !== MembershipStatus.Active) {
      throw new CollectiveError('acting membership is not an active member', CollectiveErrorCode.NotAuthorized);
    }
    if (!m.roles.some((r) => ADMIN_ROLES.includes(r))) {
      throw new CollectiveError('acting membership lacks administrative authority', CollectiveErrorCode.NotAuthorized);
    }
    return m;
  }

  private async requireVoter(membershipId: Id, orgId: Id, rule: ResolutionRule): Promise<Membership> {
    const m = await this.requireMembership(membershipId);
    if (m.org_id !== orgId || m.status !== MembershipStatus.Active) {
      throw new CollectiveError('voter is not an active member', CollectiveErrorCode.NotAuthorized);
    }
    const allowed = new Set(rule.voter_roles);
    if (!m.roles.some((r) => allowed.has(r))) {
      throw new CollectiveError('member is not entitled to vote on this resolution', CollectiveErrorCode.NotEligible);
    }
    return m;
  }

  private async assertNotMember(orgId: Id, memberRef: string): Promise<void> {
    const all = await this.storage.getMembershipsByOrg(orgId);
    if (all.some((m) => m.member_ref === memberRef && m.status !== MembershipStatus.Ceased)) {
      throw new CollectiveError(`${memberRef} already has a live membership`, CollectiveErrorCode.AlreadyMember);
    }
  }

  private req(value: string, field: string): void {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new CollectiveError(`${field} is required`, CollectiveErrorCode.InvalidInput);
    }
  }

  private expired(r: Resolution): boolean {
    return new Date(r.expires_at).getTime() <= this.now().getTime();
  }

  private iso(): string {
    return this.now().toISOString();
  }
}
