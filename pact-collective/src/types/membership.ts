/**
 * Membership — the link between a registered external identity (any agent: an
 * .HMAN, a DID, another organisation) and this organisation. A membership only
 * becomes `Active` once a two-sided join pact has been signed by both the
 * joining party and the organisation.
 */

import type { Attestation, SignatureEntry } from '../crypto/signer.js';
import type { Id, ISODate } from './common.js';
import type { OrgRole } from './governance.js';

export enum MembershipStatus {
  /** Org invited this identity; awaiting their signed acceptance. */
  Invited = 'invited',
  /** Identity applied to join; awaiting admission. */
  Requested = 'requested',
  /** Two-sided join pact complete. */
  Active = 'active',
  Suspended = 'suspended',
  /** Membership ended (resigned/removed). */
  Ceased = 'ceased',
}

export interface Membership {
  id: Id;
  org_id: Id;
  /** Stable external identity reference (HMAN id, DID, org id, …). */
  member_ref: string;
  display_name?: string;
  /** Key id used to resolve this member's {@link Signer}. */
  signing_key_id: string;
  /** Member's public key (base64url raw). */
  public_key: string;
  roles: OrgRole[];
  status: MembershipStatus;
  created_at: ISODate;
  updated_at: ISODate;
  joined_at?: ISODate;
  invited_by?: Id;

  // --- two-sided join pact assembly --------------------------------------
  /** Roles fixed into the signed join body. */
  pact_roles?: OrgRole[];
  /** Timestamp fixed when the first party signs; both sign the same body. */
  attestation_issued_at?: ISODate;
  /** Signatures collected so far (member and/or organisation). */
  pending_signatures?: SignatureEntry[];
  /** Assembled + verifiable join pact, present once Active. */
  join_attestation?: Attestation;
}
