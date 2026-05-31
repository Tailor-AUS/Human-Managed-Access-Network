/**
 * The company constitution — the governing document. It is versioned and
 * amendable (by a resolution of the class named in `amendment_rule`), and it
 * is the single source of truth for *how the organisation decides*: the
 * voting basis, approval threshold and quorum for each {@link ResolutionClass}
 * live here, as does the capital structure (share classes) and the list of
 * governance organs.
 */

import type { Attestation } from '../crypto/signer.js';
import type { Id, ISODate } from './common.js';
import type { LegalForm } from './legal-form.js';
import type { OrgRole } from './governance.js';
import type { ShareClassSpec } from './capital.js';
import { ResolutionClass, VotingBasis } from './resolution.js';

/** A numbered clause of the constitution. */
export interface ConstitutionClause {
  /** Clause number, e.g. "3.2". */
  number: string;
  heading: string;
  body: string;
  /** Entrenched clauses require a stricter amendment procedure (see notes). */
  entrenched?: boolean;
}

/** The rule applied when tallying a resolution of a given class. */
export interface ResolutionRule {
  basis: VotingBasis;
  /** Fraction in (0, 1] of decisive (non-abstain) votes that must be in favour. */
  approval_threshold: number;
  /** Fraction in [0, 1] of eligible voting weight that must participate. */
  quorum: number;
  /** Roles eligible to vote on this class of resolution. */
  voter_roles: OrgRole[];
}

/** A decision-making body. */
export interface GovernanceOrgan {
  name: 'members' | 'board' | string;
  description?: string;
}

export interface Constitution {
  id: Id;
  org_id: Id;
  version: number;
  legal_form: LegalForm;
  name: string;
  status: 'draft' | 'in_force' | 'superseded';
  clauses: ConstitutionClause[];
  /** Threshold/quorum/basis per resolution class — read by the consensus engine. */
  resolution_rules: Record<ResolutionClass, ResolutionRule>;
  organs: GovernanceOrgan[];
  /** Capital structure. Empty for non-share legal forms. */
  share_classes: ShareClassSpec[];
  /** Resolution class required to amend this constitution. */
  amendment_rule: ResolutionClass;
  /**
   * Whether statutory "replaceable rules" fill gaps not covered by clauses
   * (an Australian Corporations Act concept; informational here).
   */
  replaceable_rules: boolean;
  adopted_at?: ISODate;
  superseded_at?: ISODate;
  /** Org-signed adoption attestation. */
  adoption_attestation?: Attestation;
}

/** Payload of an `amend_constitution` resolution. */
export interface AmendConstitutionPayload {
  /** Full replacement clause set for the new version. */
  clauses?: ConstitutionClause[];
  /** Replacement resolution rules. */
  resolution_rules?: Partial<Record<ResolutionClass, ResolutionRule>>;
  /** Replacement / additional share classes. */
  share_classes?: ShareClassSpec[];
  /** Free-text note recorded with the amendment. */
  note?: string;
}
