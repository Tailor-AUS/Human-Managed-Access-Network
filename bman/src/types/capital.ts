/**
 * Capital structure — share/unit classes, issuance, transfer and the derived
 * register of holdings. For non-share forms (associations, partnerships) the
 * share-class list is empty and governance falls back to per-capita voting.
 */

import type { Attestation } from '../crypto/signer.js';
import type { Id, ISODate, Money } from './common.js';

/**
 * Definition of a class of shares/units in the constitution. Rights attach to
 * the class, not the individual share.
 */
export interface ShareClassSpec {
  /** Short code, e.g. "ORD", "PREF-A", "GOV". */
  code: string;
  name: string;
  /** Votes conferred per share on a poll. 0 = non-voting. */
  votes_per_share: number;
  /** Dividend/distribution entitlement. */
  dividend_right: 'ordinary' | 'preferred' | 'none';
  /** Ranks ahead of ordinary on dividends/winding up. */
  preferred?: boolean;
  /** Company may buy the share back. */
  redeemable?: boolean;
  /** Nominal/par value. */
  par_value?: Money;
  /** Maximum number the class may have on issue, if capped. */
  authorised?: number;
}

/** An allotment of shares to a member. */
export interface ShareIssue {
  id: Id;
  org_id: Id;
  class_code: string;
  holder_membership_id: Id;
  quantity: number;
  consideration?: Money;
  issued_at: ISODate;
  resolution_ref?: Id;
  /** Org-signed share certificate. */
  certificate?: Attestation;
}

/** A transfer of shares between members. */
export interface ShareTransfer {
  id: Id;
  org_id: Id;
  class_code: string;
  from_membership_id: Id;
  to_membership_id: Id;
  quantity: number;
  consideration?: Money;
  transferred_at: ISODate;
  resolution_ref?: Id;
}

/** A position in the register: net shares of one class held by one member. */
export interface Holding {
  membership_id: Id;
  class_code: string;
  quantity: number;
}
