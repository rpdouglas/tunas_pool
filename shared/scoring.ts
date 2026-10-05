/**
 * Scoring and winner selection (docs/DATA_MODEL.md §7). Pure functions, used by the admin screens
 * for the preview and by the Cloud Functions for the record that is actually published, so the two
 * cannot disagree. Money rides on this file: every rule here has a test in scoring.test.ts.
 */
import type { GameResult, Pick as PickSide, WinnerDecision } from './types';

/** What a tied NFL game does to a record (DECISIONS.md D-008: nobody gets a win by default). */
export type TieGameRule = 'no_win' | 'win_for_all' | 'half_win';

export interface ScoreRecord {
  wins: number;
  losses: number;
}

export interface ScoredPicks extends ScoreRecord {
  /** Games with no result yet. */
  remaining: number;
}

/**
 * One entry's record so far. Every game on the sheet is listed in `gameIds`. A game with no result
 * yet is "remaining". A missing pick scores as a loss once the game is decided. A tied game is a
 * non-win: it counts toward losses so records always add up to the number of decided games (D-046).
 */
export function scorePicks(
  picks: Record<string, PickSide | undefined>,
  results: Record<string, GameResult | undefined>,
  gameIds: string[],
  tieRule: TieGameRule = 'no_win',
): ScoredPicks {
  let wins = 0;
  let losses = 0;
  let remaining = 0;
  for (const id of gameIds) {
    const result = results[id];
    if (!result) {
      remaining += 1;
    } else if (result === 'tie') {
      if (tieRule === 'win_for_all') wins += 1;
      else if (tieRule === 'half_win') {
        wins += 0.5;
        losses += 0.5;
      } else losses += 1;
    } else if (picks[id] === result) {
      wins += 1;
    } else {
      losses += 1;
    }
  }
  return { wins, losses, remaining };
}

/** Wins an entry could still reach if it won every remaining game. */
export function bestPossibleWins(scored: ScoredPicks): number {
  return scored.wins + scored.remaining;
}

/** "11 – 4". */
export function formatRecord(wins: number, losses: number): string {
  return `${wins} – ${losses}`;
}

export interface Contender {
  playerId: string;
  displayName: string;
  wins: number;
  losses: number;
  /** Predicted combined Monday night points. Null if the entry has none (should not happen). */
  tiebreakerTotal: number | null;
  paid: boolean;
}

export interface WinnerOutcome {
  playerIds: string[];
  displayNames: string[];
  record: ScoreRecord;
  /** The winning tiebreaker guess (the same for every winner of a split pot). */
  mnfPrediction: number | null;
  decision: WinnerDecision;
  potCents: number;
  /** What each winner gets: the pot divided evenly, rounded down. */
  shareCents: number;
  /** Cents left over when the pot does not divide evenly. Shown to the admin, never hidden (D-046). */
  leftoverCents: number;
  /** The entries that tied for the most wins, before the tiebreaker (just the winner if one led). */
  tiedPlayerIds: string[];
}

export type WinnerResult =
  | { ok: true; outcome: WinnerOutcome }
  | { ok: false; reason: 'no_eligible_entries' | 'needs_mnf_total' };

export interface WinnerOptions {
  entryFeeCents: number;
  /** config.pool.unpaidEligibleToWin (default false, D-009). */
  unpaidEligibleToWin: boolean;
}

/**
 * The winner algorithm of DATA_MODEL §7:
 * 1. Take the eligible entries with the most wins.
 * 2. If one entry remains, it wins.
 * 3. Otherwise the tiebreaker: entries that guessed at or over the real Monday night total rank
 *    above entries that guessed under it, and among those the LOWEST guess (closest) wins. If
 *    nobody guessed at or over it, the HIGHEST guess (closest) wins.
 * 4. Entries sharing the winning guess split the pot.
 * The pot is the paid entries times the fee, whoever is eligible to win.
 */
export function pickWinners(
  contenders: Contender[],
  mnfTotal: number | null,
  options: WinnerOptions,
): WinnerResult {
  const eligible = contenders.filter((c) => c.paid || options.unpaidEligibleToWin);
  if (eligible.length === 0) return { ok: false, reason: 'no_eligible_entries' };

  const potCents = contenders.filter((c) => c.paid).length * options.entryFeeCents;
  const mostWins = Math.max(...eligible.map((c) => c.wins));
  const leaders = eligible.filter((c) => c.wins === mostWins);

  let winners = leaders;
  let decision: WinnerDecision = 'most_wins';

  if (leaders.length > 1) {
    if (mnfTotal === null) return { ok: false, reason: 'needs_mnf_total' };
    const guessed = leaders.filter((c) => c.tiebreakerTotal !== null);
    const pool = guessed.length > 0 ? guessed : leaders;
    const atOrOver = pool.filter((c) => (c.tiebreakerTotal ?? -1) >= mnfTotal);
    let best: number;
    if (atOrOver.length > 0) best = Math.min(...atOrOver.map((c) => c.tiebreakerTotal!));
    else if (guessed.length > 0) best = Math.max(...guessed.map((c) => c.tiebreakerTotal!));
    else best = NaN; // nobody has a guess: they all share the pot
    winners = Number.isNaN(best) ? pool : pool.filter((c) => c.tiebreakerTotal === best);
    decision = winners.length > 1 ? 'split_pot' : 'tiebreaker';
  }

  const shareCents = Math.floor(potCents / winners.length);
  return {
    ok: true,
    outcome: {
      playerIds: winners.map((c) => c.playerId),
      displayNames: winners.map((c) => c.displayName),
      record: { wins: winners[0].wins, losses: winners[0].losses },
      mnfPrediction: winners[0].tiebreakerTotal,
      decision,
      potCents,
      shareCents,
      leftoverCents: potCents - shareCents * winners.length,
      tiedPlayerIds: leaders.map((c) => c.playerId),
    },
  };
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * "How this was decided", in plain words (Gerald Trust Test). `tiedNames` are the entries that tied
 * for the most wins, in the same order as `outcome.tiedPlayerIds`.
 */
export function explainOutcome(
  outcome: WinnerOutcome,
  mnfTotal: number | null,
  tiedNames: string[],
): string {
  const record = formatRecord(outcome.record.wins, outcome.record.losses);
  const who = joinNames(outcome.displayNames);
  if (outcome.decision === 'most_wins') {
    return `${who} had the most correct picks (${record}).`;
  }
  const tied = `${tiedNames.length} players tied at ${record}.`;
  if (outcome.decision === 'split_pot') {
    return `${tied} ${who} all guessed ${outcome.mnfPrediction}, the closest to the Monday night total of ${mnfTotal}, so they split the pot.`;
  }
  const guess = outcome.mnfPrediction;
  const over = mnfTotal !== null && guess !== null && guess >= mnfTotal;
  return over
    ? `${tied} The tiebreaker decided it: the Monday night total was ${mnfTotal}, and ${who}'s guess of ${guess} was the closest at or over it.`
    : `${tied} The tiebreaker decided it: the Monday night total was ${mnfTotal}. Nobody guessed at or over it, so ${who}'s guess of ${guess}, the closest under it, won.`;
}

/** "$27.33" for display. */
export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
