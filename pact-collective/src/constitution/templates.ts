/**
 * Constitution templates — ready-made governing documents per legal form.
 *
 * Each template fixes the capital structure, the governance organs, and —
 * critically — the `resolution_rules`: the voting basis, approval threshold
 * and quorum the consensus engine applies to each class of resolution. These
 * encode real corporate conventions (e.g. a special resolution carries at 75%
 * of votes; companies vote per share; co-ops vote per capita).
 *
 * Templates are a starting point: every value can be amended later by a
 * resolution of the class named in `amendment_rule`.
 */

import type { Id } from '../types/common.js';
import { LegalForm } from '../types/legal-form.js';
import { OrgRole } from '../types/governance.js';
import type { ShareClassSpec } from '../types/capital.js';
import {
  ResolutionClass,
  VotingBasis,
} from '../types/resolution.js';
import type {
  Constitution,
  ConstitutionClause,
  GovernanceOrgan,
  ResolutionRule,
} from '../types/constitution.js';

export interface BuildConstitutionParams {
  id: Id;
  org_id: Id;
  legal_form: LegalForm;
  name: string;
  version?: number;
}

const MEMBER_VOTER_ROLES = [OrgRole.Founder, OrgRole.Member, OrgRole.Shareholder];
const BOARD_VOTER_ROLES = [OrgRole.Director, OrgRole.Chair, OrgRole.ManagingDirector];

/** Build the resolution-rule table for a basis, with conventional thresholds. */
function rules(
  memberBasis: VotingBasis,
  opts?: {
    ordinaryThreshold?: number;
    specialThreshold?: number;
    quorum?: number;
    memberVoterRoles?: OrgRole[];
  }
): Record<ResolutionClass, ResolutionRule> {
  const quorum = opts?.quorum ?? 0.5;
  const voter_roles = opts?.memberVoterRoles ?? MEMBER_VOTER_ROLES;
  return {
    [ResolutionClass.Ordinary]: {
      basis: memberBasis,
      approval_threshold: opts?.ordinaryThreshold ?? 0.5,
      quorum,
      voter_roles,
    },
    [ResolutionClass.Special]: {
      basis: memberBasis,
      approval_threshold: opts?.specialThreshold ?? 0.75,
      quorum,
      voter_roles,
    },
    [ResolutionClass.Unanimous]: {
      basis: memberBasis,
      approval_threshold: 1,
      quorum: 1,
      voter_roles,
    },
    [ResolutionClass.Board]: {
      basis: VotingBasis.Board,
      approval_threshold: 0.5,
      quorum: 0.5,
      voter_roles: BOARD_VOTER_ROLES,
    },
  };
}

const ORDINARY_SHARE: ShareClassSpec = {
  code: 'ORD',
  name: 'Ordinary Shares',
  votes_per_share: 1,
  dividend_right: 'ordinary',
};

const GOVERNANCE_TOKEN: ShareClassSpec = {
  code: 'GOV',
  name: 'Governance Tokens',
  votes_per_share: 1,
  dividend_right: 'none',
};

const TRUST_UNIT: ShareClassSpec = {
  code: 'UNIT',
  name: 'Units',
  votes_per_share: 1,
  dividend_right: 'ordinary',
};

const MEMBERS_AND_BOARD: GovernanceOrgan[] = [
  { name: 'members', description: 'The members in general meeting.' },
  { name: 'board', description: 'The board of directors.' },
];

function standardClauses(name: string, form: LegalForm): ConstitutionClause[] {
  return [
    { number: '1', heading: 'Name', body: `The name of the organisation is ${name}.` },
    {
      number: '2',
      heading: 'Legal form',
      body: `The organisation is constituted as a ${form.replace(/_/g, ' ')}.`,
    },
    {
      number: '3',
      heading: 'Objects',
      body: 'The organisation may pursue any lawful purpose decided by its members.',
    },
    {
      number: '4',
      heading: 'Members',
      body: 'Membership is granted by a completed join pact and recorded in the register of members.',
    },
    {
      number: '5',
      heading: 'Decisions',
      body: 'Decisions are made by resolution. Ordinary resolutions require a simple majority; special resolutions require the threshold set in the resolution rules.',
    },
    {
      number: '6',
      heading: 'Officers and directors',
      body: 'The members may appoint and remove directors and officers by resolution.',
    },
    {
      number: '7',
      heading: 'Amendment',
      body: 'This constitution may be amended only by a resolution of the class stated in the amendment rule.',
    },
    {
      number: '8',
      heading: 'Winding up',
      body: 'The organisation may be dissolved by special resolution, subject to the satisfaction of its liabilities.',
    },
  ];
}

/** Build a full, in-force-ready constitution for the given legal form. */
export function buildConstitution(params: BuildConstitutionParams): Constitution {
  const version = params.version ?? 1;
  const base: Omit<Constitution, 'resolution_rules' | 'share_classes' | 'amendment_rule' | 'organs' | 'replaceable_rules'> = {
    id: params.id,
    org_id: params.org_id,
    version,
    legal_form: params.legal_form,
    name: params.name,
    status: 'draft',
    clauses: standardClauses(params.name, params.legal_form),
  };

  switch (params.legal_form) {
    case LegalForm.CompanyLimitedByShares:
      return {
        ...base,
        resolution_rules: rules(VotingBasis.PerShare),
        share_classes: [ORDINARY_SHARE],
        organs: MEMBERS_AND_BOARD,
        amendment_rule: ResolutionClass.Special,
        replaceable_rules: true,
      };

    case LegalForm.DAO:
      return {
        ...base,
        resolution_rules: rules(VotingBasis.PerShare, {
          ordinaryThreshold: 0.5,
          specialThreshold: 0.667,
          quorum: 0.4,
        }),
        share_classes: [GOVERNANCE_TOKEN],
        organs: [
          { name: 'members', description: 'Token holders.' },
          { name: 'board', description: 'Core contributors / council.' },
        ],
        amendment_rule: ResolutionClass.Special,
        replaceable_rules: false,
      };

    case LegalForm.Trust:
      return {
        ...base,
        resolution_rules: rules(VotingBasis.PerShare),
        share_classes: [TRUST_UNIT],
        organs: [
          { name: 'members', description: 'Unit holders.' },
          { name: 'board', description: 'Trustee(s).' },
        ],
        amendment_rule: ResolutionClass.Special,
        replaceable_rules: false,
      };

    case LegalForm.Cooperative:
      return {
        ...base,
        resolution_rules: rules(VotingBasis.PerCapita),
        share_classes: [],
        organs: MEMBERS_AND_BOARD,
        amendment_rule: ResolutionClass.Special,
        replaceable_rules: false,
      };

    case LegalForm.Partnership:
    case LegalForm.LimitedPartnership:
      return {
        ...base,
        resolution_rules: rules(VotingBasis.PerCapita, { specialThreshold: 0.75 }),
        share_classes: [],
        organs: [{ name: 'members', description: 'The partners.' }],
        // Major changes to a partnership conventionally need unanimity.
        amendment_rule: ResolutionClass.Unanimous,
        replaceable_rules: false,
      };

    case LegalForm.CompanyLimitedByGuarantee:
    case LegalForm.IncorporatedAssociation:
    case LegalForm.Foundation:
    default:
      return {
        ...base,
        resolution_rules: rules(VotingBasis.PerCapita),
        share_classes: [],
        organs: MEMBERS_AND_BOARD,
        amendment_rule: ResolutionClass.Special,
        replaceable_rules: params.legal_form === LegalForm.CompanyLimitedByGuarantee,
      };
  }
}
