/**
 * Governance roles, directors and officers — the human (or agent) organs of
 * the organisation. Roles gate who may act and who may vote; office holders
 * carry named corporate responsibilities.
 */

import type { Attestation } from '../crypto/signer.js';
import type { Id, ISODate } from './common.js';

/**
 * A capacity a membership holds in the organisation. A single membership may
 * hold several (e.g. a founder who is also a director and a shareholder).
 */
export enum OrgRole {
  /** Incorporator — present from formation; cannot be removed by resolution. */
  Founder = 'founder',
  Director = 'director',
  Chair = 'chair',
  ManagingDirector = 'managing_director',
  /** Holder of a named office (see {@link OfficeType}). */
  Officer = 'officer',
  Secretary = 'secretary',
  /** Ordinary member with no equity (associations, co-ops). */
  Member = 'member',
  /** Equity holder. */
  Shareholder = 'shareholder',
  /** In the register, no vote and no administrative rights. */
  Observer = 'observer',
}

/** Named corporate offices. */
export enum OfficeType {
  CEO = 'ceo',
  CFO = 'cfo',
  COO = 'coo',
  Secretary = 'secretary',
  Treasurer = 'treasurer',
  /** AU incorporated-association statutory office. */
  PublicOfficer = 'public_officer',
  President = 'president',
  Chair = 'chair',
}

export interface DirectorAppointment {
  id: Id;
  org_id: Id;
  membership_id: Id;
  title: 'director' | 'chair' | 'managing_director';
  appointed_at: ISODate;
  ceased_at?: ISODate;
  /** Resolution that authorised the appointment, if any. */
  resolution_ref?: Id;
  /** Org-signed appointment record. */
  attestation?: Attestation;
}

export interface OfficerAppointment {
  id: Id;
  org_id: Id;
  membership_id: Id;
  office: OfficeType;
  appointed_at: ISODate;
  ceased_at?: ISODate;
  resolution_ref?: Id;
  attestation?: Attestation;
}
