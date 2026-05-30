/**
 * Corporate flows: incorporation, the company constitution, membership join
 * pacts, capital (share issuance/transfer/register) and governance organs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Collective,
  CollectiveError,
  CollectiveErrorCode,
  MemoryCollectiveStorage,
} from '../manager/index.js';
import { Ed25519Verifier, MemoryKeyStore } from '../crypto/index.js';
import { LegalForm, OrgStatus } from '../types/legal-form.js';
import { OrgRole, OfficeType } from '../types/governance.js';
import { MembershipStatus } from '../types/membership.js';

function setup() {
  const keys = new MemoryKeyStore();
  const storage = new MemoryCollectiveStorage();
  const collective = new Collective({ storage, signers: keys, verifier: new Ed25519Verifier() });
  return { keys, storage, collective };
}

/** Register a fresh identity (keypair) and return what the API needs. */
function identity(keys: MemoryKeyStore, keyId: string) {
  const kp = keys.create(keyId);
  return { signing_key_id: keyId, public_key: kp.publicKey };
}

describe('incorporation', () => {
  let keys: MemoryKeyStore;
  let collective: Collective;

  beforeEach(() => {
    ({ keys, collective } = setup());
  });

  async function incorporatePtyLtd() {
    keys.create('org-1');
    const founder = identity(keys, 'founder-1');
    return collective.incorporate({
      legal_form: LegalForm.CompanyLimitedByShares,
      legal_name: 'Acme Robotics Pty Ltd',
      jurisdiction: 'AU-VIC',
      org_signing_key_id: 'org-1',
      org_public_key: keys.publicKeyOf('org-1')!,
      founder_member_ref: 'hman:founder',
      founder_signing_key_id: founder.signing_key_id,
      founder_public_key: founder.public_key,
      initial_shares: { class_code: 'ORD', quantity: 100 },
    });
  }

  it('creates an active company with an in-force, verifiable constitution', async () => {
    const { organisation, constitution } = await incorporatePtyLtd();
    expect(organisation.status).toBe(OrgStatus.Active);
    expect(organisation.constitution_id).toBe(constitution.id);
    expect(constitution.status).toBe('in_force');
    expect(constitution.share_classes[0]?.code).toBe('ORD');
    expect(await collective.verifyConstitution(constitution.id)).toBe(true);
  });

  it('admits the founder as a director/shareholder with a verifiable join pact', async () => {
    const { founderMembership } = await incorporatePtyLtd();
    expect(founderMembership.status).toBe(MembershipStatus.Active);
    expect(founderMembership.roles).toEqual(
      expect.arrayContaining([OrgRole.Founder, OrgRole.Director, OrgRole.Shareholder])
    );
    expect(await collective.verifyMembership(founderMembership.id)).toBe(true);
  });

  it('records the founder’s initial shareholding in the register', async () => {
    const { organisation, founderMembership } = await incorporatePtyLtd();
    const register = await collective.shareRegister(organisation.id);
    expect(register).toEqual([
      { membership_id: founderMembership.id, class_code: 'ORD', quantity: 100 },
    ]);
  });

  it('adopts a per-capita constitution for a cooperative (no share capital)', async () => {
    keys.create('org-coop');
    const founder = identity(keys, 'coop-founder');
    const { constitution, founderMembership } = await collective.incorporate({
      legal_form: LegalForm.Cooperative,
      legal_name: 'Riverside Growers Co-operative',
      org_signing_key_id: 'org-coop',
      org_public_key: keys.publicKeyOf('org-coop')!,
      founder_member_ref: 'hman:coop-founder',
      founder_signing_key_id: founder.signing_key_id,
      founder_public_key: founder.public_key,
    });
    expect(constitution.share_classes).toHaveLength(0);
    expect(founderMembership.roles).toContain(OrgRole.Member);
  });
});

describe('membership join pacts', () => {
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
      legal_name: 'Beta Co Pty Ltd',
      org_signing_key_id: 'org',
      org_public_key: keys.publicKeyOf('org')!,
      founder_member_ref: 'hman:f',
      founder_signing_key_id: f.signing_key_id,
      founder_public_key: f.public_key,
      initial_shares: { class_code: 'ORD', quantity: 100 },
    });
    orgId = r.organisation.id;
    founderId = r.founderMembership.id;
  });

  it('invite → accept produces a complete, verifiable pact', async () => {
    const joiner = identity(keys, 'joiner');
    const invited = await collective.inviteMember({
      org_id: orgId,
      inviter_membership_id: founderId,
      member_ref: 'hman:joiner',
      signing_key_id: joiner.signing_key_id,
      public_key: joiner.public_key,
      roles: [OrgRole.Member],
    });
    expect(invited.status).toBe(MembershipStatus.Invited);

    const active = await collective.acceptInvite(invited.id);
    expect(active.status).toBe(MembershipStatus.Active);
    expect(await collective.verifyMembership(active.id)).toBe(true);
  });

  it('request → admit (by a director) produces a complete pact', async () => {
    const joiner = identity(keys, 'applicant');
    const requested = await collective.requestToJoin({
      org_id: orgId,
      member_ref: 'hman:applicant',
      signing_key_id: joiner.signing_key_id,
      public_key: joiner.public_key,
    });
    expect(requested.status).toBe(MembershipStatus.Requested);

    const admitted = await collective.admitMember(requested.id, founderId);
    expect(admitted.status).toBe(MembershipStatus.Active);
    expect(await collective.verifyMembership(admitted.id)).toBe(true);
  });

  it('rejects a second live membership for the same identity', async () => {
    const joiner = identity(keys, 'dup');
    await collective.requestToJoin({
      org_id: orgId,
      member_ref: 'hman:dup',
      signing_key_id: joiner.signing_key_id,
      public_key: joiner.public_key,
    });
    await expect(
      collective.requestToJoin({
        org_id: orgId,
        member_ref: 'hman:dup',
        signing_key_id: joiner.signing_key_id,
        public_key: joiner.public_key,
      })
    ).rejects.toMatchObject({ code: CollectiveErrorCode.AlreadyMember });
  });

  it('refuses admission from a non-administrator', async () => {
    // ordinary member joins
    const m = identity(keys, 'ord');
    const inv = await collective.inviteMember({
      org_id: orgId,
      inviter_membership_id: founderId,
      member_ref: 'hman:ord',
      signing_key_id: m.signing_key_id,
      public_key: m.public_key,
      roles: [OrgRole.Member],
    });
    const ordinary = await collective.acceptInvite(inv.id);

    const applicant = identity(keys, 'applicant2');
    const req = await collective.requestToJoin({
      org_id: orgId,
      member_ref: 'hman:applicant2',
      signing_key_id: applicant.signing_key_id,
      public_key: applicant.public_key,
    });
    await expect(collective.admitMember(req.id, ordinary.id)).rejects.toBeInstanceOf(CollectiveError);
  });
});

describe('capital & governance (direct administrator actions)', () => {
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
      legal_name: 'Gamma Pty Ltd',
      org_signing_key_id: 'org',
      org_public_key: keys.publicKeyOf('org')!,
      founder_member_ref: 'hman:f',
      founder_signing_key_id: f.signing_key_id,
      founder_public_key: f.public_key,
      initial_shares: { class_code: 'ORD', quantity: 100 },
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

  it('issues and transfers shares, keeping the register consistent', async () => {
    const m = await addMember('m1', 'hman:m1');
    await collective.issueShares(orgId, m.id, 'ORD', 40, founderId);
    let reg = await collective.shareRegister(orgId);
    expect(reg.find((h) => h.membership_id === m.id)?.quantity).toBe(40);

    await collective.transferShares(orgId, founderId, m.id, 'ORD', 10, founderId);
    reg = await collective.shareRegister(orgId);
    expect(reg.find((h) => h.membership_id === founderId)?.quantity).toBe(90);
    expect(reg.find((h) => h.membership_id === m.id)?.quantity).toBe(50);
  });

  it('refuses to transfer more shares than held', async () => {
    const m = await addMember('m2', 'hman:m2');
    await expect(
      collective.transferShares(orgId, m.id, founderId, 'ORD', 5, founderId)
    ).rejects.toMatchObject({ code: CollectiveErrorCode.InsufficientShares });
  });

  it('rejects issuance in an unknown share class', async () => {
    const m = await addMember('m3', 'hman:m3');
    await expect(
      collective.issueShares(orgId, m.id, 'PREF', 10, founderId)
    ).rejects.toMatchObject({ code: CollectiveErrorCode.UnknownShareClass });
  });

  it('appoints a director and a secretary with org-signed records', async () => {
    const m = await addMember('m4', 'hman:m4');
    const dir = await collective.appointDirector(orgId, m.id, 'director', founderId);
    expect(dir.attestation).toBeDefined();
    const directors = await collective.registerOfDirectors(orgId);
    expect(directors.some((d) => d.membership_id === m.id)).toBe(true);

    await collective.appointOfficer(orgId, m.id, OfficeType.Secretary, founderId);
    const updated = await collective.getMembership(m.id);
    expect(updated?.roles).toEqual(expect.arrayContaining([OrgRole.Director, OrgRole.Secretary]));
  });
});
