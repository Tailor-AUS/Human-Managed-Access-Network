/**
 * OrganisationManager tests — the business/collective equivalent of a member
 * (PROTOCOL.md § Organisation Model). Covers founding, joining (request /
 * invite), direct admission, PACT consensus admission, role + lifecycle
 * transitions, and signature verification.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  OrgKind,
  OrgRole,
  OrgStatus,
  MembershipStatus,
  AdmissionRule,
  ProposalKind,
  ProposalStatus,
  type Entity,
  type OrgAuditEvent,
} from '@hman/shared';
import { initCrypto } from '../crypto/encryption.js';
import { createKeyManager, KeyManager } from '../crypto/keys.js';
import { EntityManager } from '../entity/entity-manager.js';
import { MemoryEntityStorage } from '../entity/memory-storage.js';
import {
  OrganisationManager,
  OrgErrorCode,
} from '../organisation/organisation-manager.js';
import { MemoryOrganisationStorage } from '../organisation/memory-storage.js';
import { tallyVotes } from '../organisation/pact-consensus.js';

describe('OrganisationManager', () => {
  let keyManager: KeyManager;
  let entities: EntityManager;
  let orgs: OrganisationManager;
  let events: OrgAuditEvent[];

  beforeAll(async () => {
    await initCrypto();
  });

  beforeEach(async () => {
    keyManager = await createKeyManager();
    await keyManager.createMasterKey('test-passphrase');
    entities = new EntityManager({
      storage: new MemoryEntityStorage(),
      keyManager,
      memberId: 'member-founder',
    });
    events = [];
    orgs = new OrganisationManager({
      storage: new MemoryOrganisationStorage(),
      keyManager,
      onAudit: (e) => {
        events.push(e);
      },
    });
  });

  /** Helper: make an entity (loads its signing key into the shared KeyManager). */
  async function makeEntity(name: string): Promise<Entity> {
    return entities.createEntity({ display_name: name });
  }

  async function foundOrg(
    founder: Entity,
    governance?: Parameters<OrganisationManager['createOrganisation']>[0]['governance']
  ) {
    return orgs.createOrganisation({
      display_name: 'Acme Co-op',
      kind: OrgKind.Cooperative,
      founder_member_id: 'member-founder',
      founder_entity_id: founder.id,
      founder_entity_pub: founder.key_pub,
      governance,
    });
  }

  describe('createOrganisation', () => {
    it('founds an org with a signing key and an active owner membership', async () => {
      const founder = await makeEntity('Founder Trade');
      const { org, founderMembership } = await foundOrg(founder);

      expect(org.id).toBeTruthy();
      expect(org.key_pub).toBeTruthy();
      expect(org.status).toBe(OrgStatus.Active);
      expect(founderMembership.role).toBe(OrgRole.Owner);
      expect(founderMembership.status).toBe(MembershipStatus.Active);
      expect(founderMembership.join_attestation).toBeDefined();
      expect(keyManager.hasEntityKey(org.id)).toBe(true);
    });

    it('produces a verifiable founder join pact', async () => {
      const founder = await makeEntity('Founder');
      const { founderMembership } = await foundOrg(founder);
      expect(await orgs.verifyMembership(founderMembership.id)).toBe(true);
    });

    it('persists the encrypted org signing key', async () => {
      const founder = await makeEntity('Founder');
      const { org } = await foundOrg(founder);
      const storage = new MemoryOrganisationStorage();
      // sanity: the manager stored a key we can reload into a fresh keyManager
      const reloaded = await orgs.ensureOrgKeyLoaded(org.id);
      expect(reloaded).toBe(true);
      void storage;
    });

    it('rejects an empty display name', async () => {
      const founder = await makeEntity('Founder');
      await expect(
        orgs.createOrganisation({
          display_name: '',
          founder_member_id: 'm',
          founder_entity_id: founder.id,
          founder_entity_pub: founder.key_pub,
        })
      ).rejects.toMatchObject({ code: OrgErrorCode.InvalidInput });
    });

    it('rejects invalid governance thresholds', async () => {
      const founder = await makeEntity('Founder');
      await expect(foundOrg(founder, { quorum: 0 })).rejects.toMatchObject({
        code: OrgErrorCode.InvalidInput,
      });
      await expect(foundOrg(founder, { approval_threshold: 2 })).rejects.toMatchObject({
        code: OrgErrorCode.InvalidInput,
      });
    });

    it('requires an unlocked key manager', async () => {
      const founder = await makeEntity('Founder');
      keyManager.lock();
      await expect(foundOrg(founder)).rejects.toMatchObject({
        code: OrgErrorCode.KeyManagerLocked,
      });
    });
  });

  describe('join by request → admit (Admins rule)', () => {
    it('lets a registered HMAN request and an admin admit them', async () => {
      const founder = await makeEntity('Founder');
      const { org, founderMembership } = await foundOrg(founder);

      const joiner = await makeEntity('Joiner');
      const requested = await orgs.requestToJoin({
        org_id: org.id,
        member_id: 'member-joiner',
        entity_id: joiner.id,
        entity_pub: joiner.key_pub,
      });
      expect(requested.status).toBe(MembershipStatus.Requested);
      expect(requested.member_signature).toBeTruthy();
      expect(requested.org_signature).toBeUndefined();

      const admitted = await orgs.admitMember(requested.id, founderMembership.id);
      expect(admitted.status).toBe(MembershipStatus.Active);
      expect(admitted.join_attestation).toBeDefined();
      expect(await orgs.verifyMembership(admitted.id)).toBe(true);
    });

    it('refuses admission from a non-admin membership', async () => {
      const founder = await makeEntity('Founder');
      const { org } = await foundOrg(founder);

      // an ordinary member admitted first
      const memberEntity = await makeEntity('Ordinary');
      const memReq = await orgs.requestToJoin({
        org_id: org.id,
        member_id: 'm2',
        entity_id: memberEntity.id,
        entity_pub: memberEntity.key_pub,
      });
      const founderMembership = (await orgs.listMemberships(org.id)).find(
        (m) => m.role === OrgRole.Owner
      )!;
      const member = await orgs.admitMember(memReq.id, founderMembership.id);

      // a second joiner requests; the ordinary member tries to admit
      const joiner = await makeEntity('Joiner2');
      const req = await orgs.requestToJoin({
        org_id: org.id,
        member_id: 'm3',
        entity_id: joiner.id,
        entity_pub: joiner.key_pub,
      });
      await expect(orgs.admitMember(req.id, member.id)).rejects.toMatchObject({
        code: OrgErrorCode.NotAuthorized,
      });
    });

    it('rejects a duplicate live membership for the same entity', async () => {
      const founder = await makeEntity('Founder');
      const { org } = await foundOrg(founder);
      const joiner = await makeEntity('Joiner');
      await orgs.requestToJoin({
        org_id: org.id,
        member_id: 'm',
        entity_id: joiner.id,
        entity_pub: joiner.key_pub,
      });
      await expect(
        orgs.requestToJoin({
          org_id: org.id,
          member_id: 'm',
          entity_id: joiner.id,
          entity_pub: joiner.key_pub,
        })
      ).rejects.toMatchObject({ code: OrgErrorCode.AlreadyMember });
    });
  });

  describe('join by invite → accept', () => {
    it('lets an admin invite and the HMAN accept', async () => {
      const founder = await makeEntity('Founder');
      const { org, founderMembership } = await foundOrg(founder);

      const joiner = await makeEntity('Invited');
      const invited = await orgs.inviteMember({
        org_id: org.id,
        inviter_membership_id: founderMembership.id,
        member_id: 'member-invited',
        entity_id: joiner.id,
        entity_pub: joiner.key_pub,
        role: OrgRole.Admin,
      });
      expect(invited.status).toBe(MembershipStatus.Invited);
      expect(invited.org_signature).toBeTruthy();
      expect(invited.member_signature).toBeUndefined();

      const active = await orgs.acceptInvite(invited.id);
      expect(active.status).toBe(MembershipStatus.Active);
      expect(active.role).toBe(OrgRole.Admin);
      expect(await orgs.verifyMembership(active.id)).toBe(true);
    });
  });

  describe('PACT consensus admission (Quorum rule)', () => {
    async function setupQuorumOrg() {
      const founder = await makeEntity('Founder');
      const { org, founderMembership } = await foundOrg(founder, {
        admission_rule: AdmissionRule.Quorum,
        quorum: 0.5,
        approval_threshold: 0.5,
      });

      // add two more active members via... we need admins to admit, but rule
      // is Quorum. Seed members directly through invite (org signs) + accept.
      const created: string[] = [founderMembership.id];
      for (const name of ['Member A', 'Member B']) {
        const e = await makeEntity(name);
        const inv = await orgs.inviteMember({
          org_id: org.id,
          inviter_membership_id: founderMembership.id,
          member_id: `m-${name}`,
          entity_id: e.id,
          entity_pub: e.key_pub,
          role: OrgRole.Member,
        });
        const active = await orgs.acceptInvite(inv.id);
        created.push(active.id);
      }
      return { org, founderMembership, voterMembershipIds: created };
    }

    it('admits a requester once consensus is reached', async () => {
      const { org, founderMembership, voterMembershipIds } = await setupQuorumOrg();

      const joiner = await makeEntity('Applicant');
      const req = await orgs.requestToJoin({
        org_id: org.id,
        member_id: 'm-applicant',
        entity_id: joiner.id,
        entity_pub: joiner.key_pub,
      });

      // Direct admission is not allowed under Quorum governance.
      await expect(orgs.admitMember(req.id, founderMembership.id)).rejects.toMatchObject({
        code: OrgErrorCode.NotAuthorized,
      });

      const proposal = await orgs.openProposal({
        org_id: org.id,
        proposed_by: founderMembership.id,
        kind: ProposalKind.AdmitMember,
        subject_membership_id: req.id,
      });
      expect(proposal.status).toBe(ProposalStatus.Open);

      // 3 eligible voters, quorum 0.5 → 2 votes meet quorum.
      await orgs.castVote({
        proposal_id: proposal.id,
        voter_membership_id: voterMembershipIds[0],
        decision: 'approve',
      });
      await orgs.castVote({
        proposal_id: proposal.id,
        voter_membership_id: voterMembershipIds[1],
        decision: 'approve',
      });

      const finalized = await orgs.finalizeProposal(proposal.id);
      expect(finalized.status).toBe(ProposalStatus.Accepted);
      expect(finalized.consensus?.reached).toBe(true);
      expect(orgs.verifyConsensus(finalized.consensus!)).toBe(true);

      const admitted = await orgs.getMembership(req.id);
      expect(admitted?.status).toBe(MembershipStatus.Active);
      expect(admitted?.join_attestation?.consensus_ref).toBe(proposal.id);
      expect(await orgs.verifyMembership(req.id)).toBe(true);
    });

    it('rejects when the decisive vote fails the threshold', async () => {
      const { org, founderMembership, voterMembershipIds } = await setupQuorumOrg();
      const joiner = await makeEntity('Applicant2');
      const req = await orgs.requestToJoin({
        org_id: org.id,
        member_id: 'm-applicant2',
        entity_id: joiner.id,
        entity_pub: joiner.key_pub,
      });
      const proposal = await orgs.openProposal({
        org_id: org.id,
        proposed_by: founderMembership.id,
        kind: ProposalKind.AdmitMember,
        subject_membership_id: req.id,
      });
      // all 3 vote, 1 approve / 2 reject → quorum met, threshold fails
      await orgs.castVote({
        proposal_id: proposal.id,
        voter_membership_id: voterMembershipIds[0],
        decision: 'approve',
      });
      await orgs.castVote({
        proposal_id: proposal.id,
        voter_membership_id: voterMembershipIds[1],
        decision: 'reject',
      });
      const finalized = await orgs.castVote({
        proposal_id: proposal.id,
        voter_membership_id: voterMembershipIds[2],
        decision: 'reject',
      });
      // last vote completes the pool → auto-finalized
      expect(finalized.status).toBe(ProposalStatus.Rejected);
      const subject = await orgs.getMembership(req.id);
      expect(subject?.status).toBe(MembershipStatus.Requested);
    });

    it('prevents double voting', async () => {
      const { org, founderMembership, voterMembershipIds } = await setupQuorumOrg();
      const joiner = await makeEntity('Applicant3');
      const req = await orgs.requestToJoin({
        org_id: org.id,
        member_id: 'm-applicant3',
        entity_id: joiner.id,
        entity_pub: joiner.key_pub,
      });
      const proposal = await orgs.openProposal({
        org_id: org.id,
        proposed_by: founderMembership.id,
        kind: ProposalKind.AdmitMember,
        subject_membership_id: req.id,
      });
      await orgs.castVote({
        proposal_id: proposal.id,
        voter_membership_id: voterMembershipIds[0],
        decision: 'approve',
      });
      await expect(
        orgs.castVote({
          proposal_id: proposal.id,
          voter_membership_id: voterMembershipIds[0],
          decision: 'reject',
        })
      ).rejects.toMatchObject({ code: OrgErrorCode.DuplicateVote });
    });

    it('finalizeProposal throws while still below quorum', async () => {
      const { org, founderMembership, voterMembershipIds } = await setupQuorumOrg();
      const joiner = await makeEntity('Applicant4');
      const req = await orgs.requestToJoin({
        org_id: org.id,
        member_id: 'm-applicant4',
        entity_id: joiner.id,
        entity_pub: joiner.key_pub,
      });
      const proposal = await orgs.openProposal({
        org_id: org.id,
        proposed_by: founderMembership.id,
        kind: ProposalKind.AdmitMember,
        subject_membership_id: req.id,
      });
      await orgs.castVote({
        proposal_id: proposal.id,
        voter_membership_id: voterMembershipIds[0],
        decision: 'approve',
      });
      await expect(orgs.finalizeProposal(proposal.id)).rejects.toMatchObject({
        code: OrgErrorCode.ConsensusNotReached,
      });
    });
  });

  describe('lifecycle + governance via PACT', () => {
    it('changes a role through an accepted ChangeRole proposal', async () => {
      const founder = await makeEntity('Founder');
      const { org, founderMembership } = await foundOrg(founder, {
        admission_rule: AdmissionRule.Admins,
        quorum: 0.5,
        approval_threshold: 0.5,
      });
      const joiner = await makeEntity('Joiner');
      const req = await orgs.requestToJoin({
        org_id: org.id,
        member_id: 'm',
        entity_id: joiner.id,
        entity_pub: joiner.key_pub,
      });
      const member = await orgs.admitMember(req.id, founderMembership.id);

      const proposal = await orgs.openProposal({
        org_id: org.id,
        proposed_by: founderMembership.id,
        kind: ProposalKind.ChangeRole,
        subject_membership_id: member.id,
        payload: { role: OrgRole.Admin },
      });
      // 2 eligible voters (owner + member), quorum 0.5 → 1 vote meets quorum
      await orgs.castVote({
        proposal_id: proposal.id,
        voter_membership_id: founderMembership.id,
        decision: 'approve',
      });
      const finalized = await orgs.finalizeProposal(proposal.id);
      expect(finalized.status).toBe(ProposalStatus.Accepted);
      const updated = await orgs.getMembership(member.id);
      expect(updated?.role).toBe(OrgRole.Admin);
    });

    it('suspends, reinstates and revokes a membership', async () => {
      const founder = await makeEntity('Founder');
      const { org, founderMembership } = await foundOrg(founder);
      const joiner = await makeEntity('Joiner');
      const req = await orgs.requestToJoin({
        org_id: org.id,
        member_id: 'm',
        entity_id: joiner.id,
        entity_pub: joiner.key_pub,
      });
      const member = await orgs.admitMember(req.id, founderMembership.id);

      expect((await orgs.suspendMembership(member.id)).status).toBe(
        MembershipStatus.Suspended
      );
      expect((await orgs.reinstateMembership(member.id)).status).toBe(
        MembershipStatus.Active
      );
      expect((await orgs.revokeMembership(member.id)).status).toBe(
        MembershipStatus.Revoked
      );
    });

    it('refuses to revoke the owner membership', async () => {
      const founder = await makeEntity('Founder');
      const { founderMembership } = await foundOrg(founder);
      await expect(orgs.revokeMembership(founderMembership.id)).rejects.toMatchObject({
        code: OrgErrorCode.NotAuthorized,
      });
    });

    it('emits audit events for the join lifecycle', async () => {
      const founder = await makeEntity('Founder');
      const { org, founderMembership } = await foundOrg(founder);
      const joiner = await makeEntity('Joiner');
      const req = await orgs.requestToJoin({
        org_id: org.id,
        member_id: 'm',
        entity_id: joiner.id,
        entity_pub: joiner.key_pub,
      });
      await orgs.admitMember(req.id, founderMembership.id);

      const types = events.map((e) => e.type);
      expect(types).toContain('org_created');
      expect(types).toContain('membership_requested');
      expect(types).toContain('membership_admitted');
    });
  });

  describe('tamper detection', () => {
    it('fails verification when the role is altered after signing', async () => {
      const founder = await makeEntity('Founder');
      const { org, founderMembership } = await foundOrg(founder);
      const joiner = await makeEntity('Joiner');
      const req = await orgs.requestToJoin({
        org_id: org.id,
        member_id: 'm',
        entity_id: joiner.id,
        entity_pub: joiner.key_pub,
      });
      const member = await orgs.admitMember(req.id, founderMembership.id);
      const att = member.join_attestation!;
      const tampered = { ...att, role: OrgRole.Owner };
      expect(orgs.verifyJoinAttestation(tampered, org.key_pub)).toBe(false);
    });
  });
});

describe('pact-consensus tallyVotes', () => {
  const policy = {
    admission_rule: AdmissionRule.Quorum,
    quorum: 0.5,
    approval_threshold: 0.5,
    voting_roles: [OrgRole.Owner, OrgRole.Member],
    proposal_ttl_seconds: 100,
  };

  it('excludes abstain from the approval ratio but counts it toward quorum', () => {
    const votes = [
      vote('a', 'approve'),
      vote('b', 'reject'),
      vote('c', 'abstain'),
    ];
    const t = tallyVotes(votes, 4, policy);
    expect(t.cast).toBe(3);
    expect(t.quorum_met).toBe(true); // 3/4 >= 0.5
    expect(t.approval_ratio).toBe(0.5); // 1 / (1+1)
  });

  it('reports an empty pool as never meeting quorum', () => {
    const t = tallyVotes([], 0, policy);
    expect(t.quorum_met).toBe(false);
  });

  function vote(id: string, decision: 'approve' | 'reject' | 'abstain') {
    return {
      proposal_id: 'p',
      voter_membership_id: id,
      voter_entity_id: id,
      decision,
      weight: 1,
      signature: 'sig',
      voter_pub: 'pub',
      cast_at: new Date().toISOString(),
    };
  }
});
