/**
 * Legal forms an organisation can take. These drive the default constitution
 * template, capital structure and voting basis (see `constitution/templates`).
 */
export enum LegalForm {
  /** Proprietary / private company limited by shares (AU Pty Ltd, UK Ltd, US Corp). */
  CompanyLimitedByShares = 'company_limited_by_shares',
  /** Company limited by guarantee — typical for not-for-profits. No share capital. */
  CompanyLimitedByGuarantee = 'company_limited_by_guarantee',
  /** Member-owned cooperative — one member, one vote. */
  Cooperative = 'cooperative',
  /** Incorporated association (clubs, community bodies). */
  IncorporatedAssociation = 'incorporated_association',
  /** General partnership. */
  Partnership = 'partnership',
  /** Limited partnership (general + limited partners). */
  LimitedPartnership = 'limited_partnership',
  /** Trust with a trustee and unit/beneficial holders. */
  Trust = 'trust',
  /** Decentralised autonomous organisation — token-weighted governance. */
  DAO = 'dao',
  /** Charitable / purpose foundation. */
  Foundation = 'foundation',
}

/** Lifecycle status of an organisation. */
export enum OrgStatus {
  /** Created but constitution not yet adopted. */
  Registered = 'registered',
  Active = 'active',
  Suspended = 'suspended',
  InLiquidation = 'in_liquidation',
  Dissolved = 'dissolved',
}
