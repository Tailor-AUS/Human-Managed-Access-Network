/**
 * Storage port + an in-memory reference implementation.
 *
 * The manager depends only on this interface, so a real deployment can back it
 * with SQLite, Postgres, an append-only log, etc. The in-memory store deep-
 * clones on read/write so callers cannot mutate persisted state by reference.
 */

import type { Id } from '../types/common.js';
import type { Organisation } from '../types/organisation.js';
import type { Constitution } from '../types/constitution.js';
import type { Membership } from '../types/membership.js';
import type { DirectorAppointment, OfficerAppointment } from '../types/governance.js';
import type { ShareIssue, ShareTransfer } from '../types/capital.js';
import type { Resolution, Vote } from '../types/resolution.js';

export interface CollectiveStorage {
  saveOrg(org: Organisation): Promise<void>;
  getOrg(id: Id): Promise<Organisation | null>;
  getAllOrgs(): Promise<Organisation[]>;

  saveConstitution(c: Constitution): Promise<void>;
  getConstitution(id: Id): Promise<Constitution | null>;
  getConstitutionsByOrg(orgId: Id): Promise<Constitution[]>;

  saveMembership(m: Membership): Promise<void>;
  getMembership(id: Id): Promise<Membership | null>;
  getMembershipsByOrg(orgId: Id): Promise<Membership[]>;

  saveDirectorAppointment(a: DirectorAppointment): Promise<void>;
  getDirectorAppointmentsByOrg(orgId: Id): Promise<DirectorAppointment[]>;

  saveOfficerAppointment(a: OfficerAppointment): Promise<void>;
  getOfficerAppointmentsByOrg(orgId: Id): Promise<OfficerAppointment[]>;

  saveShareIssue(s: ShareIssue): Promise<void>;
  getShareIssuesByOrg(orgId: Id): Promise<ShareIssue[]>;
  saveShareTransfer(t: ShareTransfer): Promise<void>;
  getShareTransfersByOrg(orgId: Id): Promise<ShareTransfer[]>;

  saveResolution(r: Resolution): Promise<void>;
  getResolution(id: Id): Promise<Resolution | null>;
  getResolutionsByOrg(orgId: Id): Promise<Resolution[]>;
  saveVote(v: Vote): Promise<void>;
  getVotes(resolutionId: Id): Promise<Vote[]>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryCollectiveStorage implements CollectiveStorage {
  private orgs = new Map<Id, Organisation>();
  private constitutions = new Map<Id, Constitution>();
  private memberships = new Map<Id, Membership>();
  private directors = new Map<Id, DirectorAppointment>();
  private officers = new Map<Id, OfficerAppointment>();
  private issues = new Map<Id, ShareIssue>();
  private transfers = new Map<Id, ShareTransfer>();
  private resolutions = new Map<Id, Resolution>();
  private votes = new Map<Id, Vote[]>();

  async saveOrg(org: Organisation): Promise<void> {
    this.orgs.set(org.id, clone(org));
  }
  async getOrg(id: Id): Promise<Organisation | null> {
    const o = this.orgs.get(id);
    return o ? clone(o) : null;
  }
  async getAllOrgs(): Promise<Organisation[]> {
    return [...this.orgs.values()].map(clone);
  }

  async saveConstitution(c: Constitution): Promise<void> {
    this.constitutions.set(c.id, clone(c));
  }
  async getConstitution(id: Id): Promise<Constitution | null> {
    const c = this.constitutions.get(id);
    return c ? clone(c) : null;
  }
  async getConstitutionsByOrg(orgId: Id): Promise<Constitution[]> {
    return [...this.constitutions.values()].filter((c) => c.org_id === orgId).map(clone);
  }

  async saveMembership(m: Membership): Promise<void> {
    this.memberships.set(m.id, clone(m));
  }
  async getMembership(id: Id): Promise<Membership | null> {
    const m = this.memberships.get(id);
    return m ? clone(m) : null;
  }
  async getMembershipsByOrg(orgId: Id): Promise<Membership[]> {
    return [...this.memberships.values()].filter((m) => m.org_id === orgId).map(clone);
  }

  async saveDirectorAppointment(a: DirectorAppointment): Promise<void> {
    this.directors.set(a.id, clone(a));
  }
  async getDirectorAppointmentsByOrg(orgId: Id): Promise<DirectorAppointment[]> {
    return [...this.directors.values()].filter((a) => a.org_id === orgId).map(clone);
  }

  async saveOfficerAppointment(a: OfficerAppointment): Promise<void> {
    this.officers.set(a.id, clone(a));
  }
  async getOfficerAppointmentsByOrg(orgId: Id): Promise<OfficerAppointment[]> {
    return [...this.officers.values()].filter((a) => a.org_id === orgId).map(clone);
  }

  async saveShareIssue(s: ShareIssue): Promise<void> {
    this.issues.set(s.id, clone(s));
  }
  async getShareIssuesByOrg(orgId: Id): Promise<ShareIssue[]> {
    return [...this.issues.values()].filter((s) => s.org_id === orgId).map(clone);
  }
  async saveShareTransfer(t: ShareTransfer): Promise<void> {
    this.transfers.set(t.id, clone(t));
  }
  async getShareTransfersByOrg(orgId: Id): Promise<ShareTransfer[]> {
    return [...this.transfers.values()].filter((t) => t.org_id === orgId).map(clone);
  }

  async saveResolution(r: Resolution): Promise<void> {
    this.resolutions.set(r.id, clone(r));
  }
  async getResolution(id: Id): Promise<Resolution | null> {
    const r = this.resolutions.get(id);
    return r ? clone(r) : null;
  }
  async getResolutionsByOrg(orgId: Id): Promise<Resolution[]> {
    return [...this.resolutions.values()].filter((r) => r.org_id === orgId).map(clone);
  }
  async saveVote(v: Vote): Promise<void> {
    const list = this.votes.get(v.resolution_id) ?? [];
    list.push(clone(v));
    this.votes.set(v.resolution_id, list);
  }
  async getVotes(resolutionId: Id): Promise<Vote[]> {
    return (this.votes.get(resolutionId) ?? []).map(clone);
  }
}
