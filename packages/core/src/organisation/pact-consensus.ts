/**
 * PACT consensus — the pure arithmetic of resolving a proposal.
 *
 * This is the .HMAN-side implementation of PACT's consensus primitive:
 * given a set of signed votes, the weight of the eligible voter pool, and
 * a governance policy, decide whether the collective has reached consensus
 * and what the outcome is. No I/O, no signing, no clock — deterministic and
 * trivially testable. The signing / sealing of the result lives in
 * {@link OrganisationManager}.
 *
 * See PROTOCOL.md § Organisation Model and CLAUDE.md § PACT relationship.
 */

import type {
  OrgGovernancePolicy,
  PactTally,
  PactVote,
  VoteDecision,
} from '@hman/shared';

/**
 * Compute the tally for a proposal.
 *
 * @param votes          the votes cast (one per voter — the manager enforces
 *                       no-double-vote before persisting).
 * @param eligibleWeight total voting weight of the eligible pool at tally
 *                       time (sum of weights of active members holding a
 *                       voting role). Used as the quorum denominator.
 * @param policy         governance thresholds.
 */
export function tallyVotes(
  votes: PactVote[],
  eligibleWeight: number,
  policy: OrgGovernancePolicy
): PactTally {
  let approve = 0;
  let reject = 0;
  let abstain = 0;

  for (const v of votes) {
    const w = weightOf(v);
    switch (v.decision) {
      case 'approve':
        approve += w;
        break;
      case 'reject':
        reject += w;
        break;
      case 'abstain':
        abstain += w;
        break;
    }
  }

  const cast = approve + reject + abstain;
  const decisive = approve + reject;
  const approval_ratio = decisive > 0 ? approve / decisive : 0;
  // Guard a zero/empty pool: an org with no eligible voters can never
  // reach quorum, so consensus is impossible until someone can vote.
  const quorum_met = eligibleWeight > 0 && cast / eligibleWeight >= policy.quorum;

  return {
    eligible: eligibleWeight,
    approve,
    reject,
    abstain,
    cast,
    quorum_met,
    approval_ratio,
  };
}

/** Has the collective reached an *accepting* consensus? */
export function isAccepted(tally: PactTally, policy: OrgGovernancePolicy): boolean {
  return tally.quorum_met && tally.approval_ratio >= policy.approval_threshold;
}

/**
 * Has the proposal been decided either way given the votes in so far?
 *
 * A proposal is decided when quorum is met (we then accept or reject on the
 * decisive ratio) or when every eligible voter has already cast — at which
 * point waiting changes nothing.
 */
export function isDecided(
  tally: PactTally,
  policy: OrgGovernancePolicy,
  allEligibleVoted: boolean
): boolean {
  if (allEligibleVoted) return true;
  return tally.quorum_met;
}

/** The terminal outcome implied by a tally. */
export function outcomeOf(
  tally: PactTally,
  policy: OrgGovernancePolicy
): 'accepted' | 'rejected' {
  return isAccepted(tally, policy) ? 'accepted' : 'rejected';
}

function weightOf(vote: PactVote): number {
  return Number.isFinite(vote.weight) && vote.weight > 0 ? vote.weight : 1;
}

/** Decisions that are valid on the wire. */
export const VOTE_DECISIONS: readonly VoteDecision[] = ['approve', 'reject', 'abstain'];
