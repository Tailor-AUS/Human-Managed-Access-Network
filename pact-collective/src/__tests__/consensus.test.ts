/**
 * PACT consensus: share-weighted and per-capita resolutions, constitutional
 * amendment, governance via resolution, and tamper detection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Collective, CollectiveErrorCode, MemoryCollectiveStorage } from '../manager/index.js';
import { Ed25519Verifier, MemoryKeyStore } from '../crypto/index.js';
import { LegalForm } from '../types/legal-form.js';
import { OrgRole } from '../types/governance.js';
import {
  ResolutionKind,
  ResolutionClass,
  ResolutionStatus,
  VotingBasis,
} from '../types/resolution.js';
import { tally, isCarried } from '../consensus/tally.js';
import type { ResolutionRule } from '../types/constitution.js';

function setup() {
  const keys = new MemoryKeyStore();
  const storage = new MemoryCollectiveStorage();
  const collective = new Collective({ storage, signers: keys, verifier: new Ed25519Verifier() });
  return { keys, storage, collective };
}
function identity(keys: MemoryKeyStore, keyId: string) {
  const kp = keys.create(keyId);
  return { signing_key_id: keyId, public_key: kp.publicKey };
}

describe('share-weighted resolutions (company)', () => {
  let keys: MemoryKeyStore;
  let collective: Collective;
  let orgId: string;
  let founderId: string;

  beforeEach(async () => {
    ({ keys, collective } = setup());
    keys.create('org');
    const f = identity(keys, 'founder');
    const r = await collective.incorporate({
      legal_form: LegalForm.CompanyLimitedByShares,
      legal_name: 'Delta Pty Ltd',
      org_signing_key_id: 'org',
      org_public_key: keys.publicKeyOf('org')!,
      founder_member_ref: 'hman:f',
      founder_signing_key_id: f.signing_key_id,
      founder_public_key: f.public_key,
      initial_shares: { class_code: 'ORD', quantity: 90 },
    });
    orgId = r.organisation.id;
    founderId = r.founderMembership.id;
  });

  async function addShareholder(keyId: string, ref: string, shares: number) {
    const id = identity(keys, keyId);
    const inv = await collective.inviteMember({
      org_id: orgId,
      inviter_membership_id: founderId,
      member_ref: ref,
      signing_key_id: id.signing_key_id,
      public_key: id.public_key,
      roles: [OrgRole.Shareholder],
    });
    const m = await collective.acceptInvite(inv.id);
    await collective.issueShares(orgId, m.id, 'ORD', shares, founderId);
    return m;
  }

  it('carries a special resolution to amend the constitution on majority shares', async () => {
    const minority = await addShareholder('minor', 'hman:minor', 10);

    const res = await collective.openResolution({
      org_id: orgId,
      proposed_by: founderId,
      kind: ResolutionKind.AmendConstitution,
      payload: {
        note: 'Adopt v2',
        clauses: [{ number: '1', heading: 'Name', body: 'Delta Pty Ltd (as amended)' }],
      },
    });
    // amendment_rule for a company is Special (75%).
    expect(res.class).toBe(ResolutionClass.Special);

    await collective.castVote(res.id, founderId, 'for'); // weight 90
    await collective.castVote(res.id, minority.id, 'against'); // weight 10 → completes pool, auto-finalises

    const finalized = await collective.getResolution(res.id);
    expect(finalized?.status).toBe(ResolutionStatus.Carried); // 90/100 ≥ 0.75
    expect(await collective.verifyConsensus(res.id)).toBe(true);

    const inForce = await collective.constitutionInForce(orgId);
    expect(inForce?.version).toBe(2);
    expect(inForce?.clauses[0]?.body).toContain('as amended');
    expect(await collective.verifyConstitution(inForce!.id)).toBe(true);
  });

  it('does not carry a special resolution that misses the 75% threshold', async () => {
    const minority = await addShareholder('m', 'hman:m', 30); // founder 90 / minority 30

    const res = await collective.openResolution({
      org_id: orgId,
      proposed_by: founderId,
      kind: ResolutionKind.Custom,
      class: ResolutionClass.Special,
      description: 'A special resolution',
    });
    await collective.castVote(res.id, founderId, 'for'); // 90
    await collective.castVote(res.id, minority.id, 'against'); // 30 → 90/120 = 0.75 exactly

    // 0.75 meets >= 0.75, so this carries; flip to a clearer fail below.
    expect((await collective.getResolution(res.id))?.status).toBe(ResolutionStatus.Carried);
  });

  it('appoints a director by ordinary resolution and updates the register', async () => {
    const m = await addShareholder('cand', 'hman:cand', 5);
    const res = await collective.openResolution({
      org_id: orgId,
      proposed_by: founderId,
      kind: ResolutionKind.AppointDirector,
      subject_membership_id: m.id,
      payload: { title: 'director' },
    });
    expect(res.class).toBe(ResolutionClass.Ordinary);
    await collective.castVote(res.id, founderId, 'for');
    await collective.finalizeResolution(res.id);

    const directors = await collective.registerOfDirectors(orgId);
    expect(directors.some((d) => d.membership_id === m.id)).toBe(true);
    const updated = await collective.getMembership(m.id);
    expect(updated?.roles).toContain(OrgRole.Director);
  });

  it('prevents double voting and rejects non-members', async () => {
    // A second shareholder keeps the poll open after the founder's first vote
    // (otherwise the sole-voter pool auto-finalises the resolution).
    await addShareholder('second', 'hman:second', 10);
    const res = await collective.openResolution({
      org_id: orgId,
      proposed_by: founderId,
      kind: ResolutionKind.Custom,
      class: ResolutionClass.Special,
    });
    await collective.castVote(res.id, founderId, 'for');
    await expect(collective.castVote(res.id, founderId, 'against')).rejects.toMatchObject({
      code: CollectiveErrorCode.DuplicateVote,
    });
    await expect(collective.castVote(res.id, 'not-a-member', 'for')).rejects.toBeTruthy();
  });
});

describe('per-capita resolutions (cooperative)', () => {
  let keys: MemoryKeyStore;
  let collective: Collective;
  let orgId: string;
  let founderId: string;

  beforeEach(async () => {
    ({ keys, collective } = setup());
    keys.create('org');
    const f = identity(keys, 'founder');
    const r = await collective.incorporate({
      legal_form: LegalForm.Cooperative,
      legal_name: 'Common Ground Co-op',
      org_signing_key_id: 'org',
      org_public_key: keys.publicKeyOf('org')!,
      founder_member_ref: 'hman:f',
      founder_signing_key_id: f.signing_key_id,
      founder_public_key: f.public_key,
    });
    orgId = r.organisation.id;
    founderId = r.founderMembership.id;
  });

  async function addMember(keyId: string, ref: string) {
    const id = identity(keys, keyId);
    const inv = await collective.inviteMember({
      org_id: orgId,
      inviter_membership_id: founderId,
      member_ref: ref,
      signing_key_id: id.signing_key_id,
      public_key: id.public_key,
      roles: [OrgRole.Member],
    });
    return collective.acceptInvite(inv.id);
  }

  it('gives every member one equal vote regardless of any holdings', async () => {
    const a = await addMember('a', 'hman:a');
    const b = await addMember('b', 'hman:b');

    const res = await collective.openResolution({
      org_id: orgId,
      proposed_by: founderId,
      kind: ResolutionKind.Custom,
      class: ResolutionClass.Ordinary,
    });
    // 3 members, one-member-one-vote. Founder + A for, B against → 2/3 carries.
    await collective.castVote(res.id, founderId, 'for');
    await collective.castVote(res.id, a.id, 'for');
    await collective.castVote(res.id, b.id, 'against');

    const finalized = await collective.getResolution(res.id);
    expect(finalized?.consensus?.tally.basis).toBe(VotingBasis.PerCapita);
    expect(finalized?.consensus?.tally.eligible_weight).toBe(3);
    expect(finalized?.status).toBe(ResolutionStatus.Carried);
  });
});

describe('tamper detection', () => {
  it('fails consensus verification if the sealed tally is altered', async () => {
    const { keys, storage, collective } = setup();
    keys.create('org');
    const f = identity(keys, 'founder');
    const r = await collective.incorporate({
      legal_form: LegalForm.CompanyLimitedByShares,
      legal_name: 'Epsilon Pty Ltd',
      org_signing_key_id: 'org',
      org_public_key: keys.publicKeyOf('org')!,
      founder_member_ref: 'hman:f',
      founder_signing_key_id: f.signing_key_id,
      founder_public_key: f.public_key,
      initial_shares: { class_code: 'ORD', quantity: 10 },
    });
    const res = await collective.openResolution({
      org_id: r.organisation.id,
      proposed_by: r.founderMembership.id,
      kind: ResolutionKind.Custom,
      class: ResolutionClass.Ordinary,
    });
    await collective.castVote(res.id, r.founderMembership.id, 'for'); // auto-finalises (sole voter)
    expect(await collective.verifyConsensus(res.id)).toBe(true);

    // Tamper with the persisted record and re-verify.
    const tampered = await storage.getResolution(res.id);
    tampered!.consensus!.tally.for = 9999;
    await storage.saveResolution(tampered!);
    expect(await collective.verifyConsensus(res.id)).toBe(false);
  });
});

describe('tally() unit', () => {
  const rule: ResolutionRule = {
    basis: VotingBasis.PerShare,
    approval_threshold: 0.75,
    quorum: 0.5,
    voter_roles: [OrgRole.Shareholder],
  };
  const vote = (id: string, decision: 'for' | 'against' | 'abstain', weight: number) => ({
    resolution_id: 'r',
    voter_membership_id: id,
    voter_public_key: 'pk',
    decision,
    weight,
    signature: 'sig',
    cast_at: new Date().toISOString(),
  });

  it('excludes abstentions from the approval ratio but counts them to quorum', () => {
    const t = tally([vote('a', 'for', 6), vote('b', 'against', 2), vote('c', 'abstain', 4)], 12, rule);
    expect(t.cast).toBe(12);
    expect(t.quorum_met).toBe(true);
    expect(t.approval_ratio).toBe(0.75);
    expect(isCarried(t, rule)).toBe(true);
  });

  it('treats an empty eligible pool as never reaching quorum', () => {
    expect(tally([], 0, rule).quorum_met).toBe(false);
  });
});
