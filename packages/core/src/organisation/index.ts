/**
 * Organisation module — the business / collective equivalent of an .HMAN
 * member. Registered HMANs join via a signed two-sided join pact, and the
 * collective makes decisions through PACT proposals + signed votes.
 *
 * See PROTOCOL.md § Organisation Model.
 */

export {
  OrganisationManager,
  OrgError,
  OrgErrorCode,
  type OrganisationStorage,
  type OrganisationManagerConfig,
  type CreateOrganisationInput,
  type JoinRequestInput,
  type InviteInput,
  type OpenProposalInput,
  type CastVoteInput,
} from './organisation-manager.js';

export { MemoryOrganisationStorage } from './memory-storage.js';

export {
  tallyVotes,
  isAccepted,
  isDecided,
  outcomeOf,
  VOTE_DECISIONS,
} from './pact-consensus.js';
