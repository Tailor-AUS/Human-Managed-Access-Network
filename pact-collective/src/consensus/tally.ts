/**
 * PACT consensus arithmetic — pure, deterministic, no I/O or signing.
 *
 * Given the votes cast, the total eligible voting weight, and the rule the
 * constitution attaches to the resolution's class, decide whether the
 * resolution is carried. Weighting (one-member-one-vote vs share-weighted vs
 * board) is reflected in the vote weights the caller supplies; this module
 * only does the sums.
 */

import type { ResolutionRule } from '../types/constitution.js';
import type { Tally, Vote } from '../types/resolution.js';

/**
 * Tally `votes` against `rule`.
 *
 * @param eligibleWeight total voting weight of the eligible pool (quorum
 *        denominator) — members for per-capita, issued voting shares for
 *        per-share, directors for board.
 */
export function tally(votes: Vote[], eligibleWeight: number, rule: ResolutionRule): Tally {
  let forW = 0;
  let againstW = 0;
  let abstainW = 0;

  for (const v of votes) {
    const w = Number.isFinite(v.weight) && v.weight > 0 ? v.weight : 0;
    if (v.decision === 'for') forW += w;
    else if (v.decision === 'against') againstW += w;
    else abstainW += w;
  }

  const cast = forW + againstW + abstainW;
  const decisive = forW + againstW;
  const approval_ratio = decisive > 0 ? forW / decisive : 0;
  const quorum_met = eligibleWeight > 0 && cast / eligibleWeight >= rule.quorum;

  return {
    basis: rule.basis,
    eligible_weight: eligibleWeight,
    for: forW,
    against: againstW,
    abstain: abstainW,
    cast,
    quorum_met,
    approval_ratio,
  };
}

/** Does this tally carry the resolution under `rule`? */
export function isCarried(t: Tally, rule: ResolutionRule): boolean {
  return t.quorum_met && t.approval_ratio >= rule.approval_threshold;
}

/**
 * Is the resolution decided given the votes so far? Decided once quorum is met
 * (we then carry/not-carry on the decisive ratio) or once every eligible voter
 * has voted (waiting changes nothing).
 */
export function isDecided(t: Tally, allEligibleVoted: boolean): boolean {
  return allEligibleVoted || t.quorum_met;
}

/** Valid vote decisions on the wire. */
export const VOTE_DECISIONS = ['for', 'against', 'abstain'] as const;
