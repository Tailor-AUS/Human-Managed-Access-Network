/**
 * In-memory OrganisationStorage for tests and ephemeral scenarios.
 * Mirrors the MemoryEntityStorage pattern.
 */

import type {
  Organisation,
  OrganisationId,
  OrgKeyData,
  OrgMembership,
  MembershipId,
  MemberId,
  PactProposal,
  PactVote,
  ProposalId,
} from '@hman/shared';
import type { OrganisationStorage } from './organisation-manager.js';

export class MemoryOrganisationStorage implements OrganisationStorage {
  private orgs = new Map<OrganisationId, Organisation>();
  private keys = new Map<OrganisationId, OrgKeyData>();
  private memberships = new Map<MembershipId, OrgMembership>();
  private proposals = new Map<ProposalId, PactProposal>();
  private votes = new Map<ProposalId, PactVote[]>();

  async saveOrg(org: Organisation): Promise<void> {
    this.orgs.set(org.id, structuredClone(org));
  }
  async getOrg(id: OrganisationId): Promise<Organisation | null> {
    const o = this.orgs.get(id);
    return o ? structuredClone(o) : null;
  }
  async getAllOrgs(): Promise<Organisation[]> {
    return Array.from(this.orgs.values()).map((o) => structuredClone(o));
  }
  async deleteOrg(id: OrganisationId): Promise<void> {
    this.orgs.delete(id);
  }

  async saveOrgKey(key: OrgKeyData): Promise<void> {
    this.keys.set(key.org_id, { ...key });
  }
  async getOrgKey(orgId: OrganisationId): Promise<OrgKeyData | null> {
    const k = this.keys.get(orgId);
    return k ? { ...k } : null;
  }
  async getAllOrgKeys(): Promise<OrgKeyData[]> {
    return Array.from(this.keys.values()).map((k) => ({ ...k }));
  }
  async deleteOrgKey(orgId: OrganisationId): Promise<void> {
    this.keys.delete(orgId);
  }

  async saveMembership(m: OrgMembership): Promise<void> {
    this.memberships.set(m.id, structuredClone(m));
  }
  async getMembership(id: MembershipId): Promise<OrgMembership | null> {
    const m = this.memberships.get(id);
    return m ? structuredClone(m) : null;
  }
  async getMembershipsByOrg(orgId: OrganisationId): Promise<OrgMembership[]> {
    return Array.from(this.memberships.values())
      .filter((m) => m.org_id === orgId)
      .map((m) => structuredClone(m));
  }
  async getMembershipsByMember(memberId: MemberId): Promise<OrgMembership[]> {
    return Array.from(this.memberships.values())
      .filter((m) => m.member_id === memberId)
      .map((m) => structuredClone(m));
  }
  async deleteMembership(id: MembershipId): Promise<void> {
    this.memberships.delete(id);
  }

  async saveProposal(p: PactProposal): Promise<void> {
    this.proposals.set(p.id, structuredClone(p));
  }
  async getProposal(id: ProposalId): Promise<PactProposal | null> {
    const p = this.proposals.get(id);
    return p ? structuredClone(p) : null;
  }
  async getProposalsByOrg(orgId: OrganisationId): Promise<PactProposal[]> {
    return Array.from(this.proposals.values())
      .filter((p) => p.org_id === orgId)
      .map((p) => structuredClone(p));
  }
  async saveVote(v: PactVote): Promise<void> {
    const list = this.votes.get(v.proposal_id) ?? [];
    list.push({ ...v });
    this.votes.set(v.proposal_id, list);
  }
  async getVotes(proposalId: ProposalId): Promise<PactVote[]> {
    return (this.votes.get(proposalId) ?? []).map((v) => ({ ...v }));
  }

  clear(): void {
    this.orgs.clear();
    this.keys.clear();
    this.memberships.clear();
    this.proposals.clear();
    this.votes.clear();
  }
}
