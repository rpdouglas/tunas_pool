/**
 * The Monday night tiebreaker, as the By game view shows it (D-105). Display only: the winner is
 * still decided by `pickWinners` in shared/scoring.ts when the commissioner publishes. The rule
 * (DATA_MODEL §7): among players tied on wins, the lowest guess at or over the Monday night total
 * wins; if nobody is at or over, the highest guess wins.
 */

export interface Guess {
  playerId: string;
  displayName: string;
  guess: number;
}

/** Order guesses by the rule against a total: at or over first (lowest first), then under (highest first). */
export function byTiebreakRule<T extends { guess: number }>(
  guesses: T[],
  total: number | null,
): T[] {
  return [...guesses].sort((a, b) => {
    if (total === null) return a.guess - b.guess;
    const aOver = a.guess >= total;
    const bOver = b.guess >= total;
    if (aOver !== bOver) return aOver ? -1 : 1;
    return aOver ? a.guess - b.guess : b.guess - a.guess;
  });
}

export interface TiebreakSummary {
  /** Every guess, lowest first. */
  guesses: Guess[];
  low: number | null;
  high: number | null;
  /** The middle guess (the median, rounded). */
  middle: number | null;
  mine: number | null;
  /** Players tied for the most wins right now, in tiebreak order, when there are two or more. */
  leaders: (Guess & { atOrOver: boolean | null })[];
}

export function tiebreakSummary(
  entries: { playerId: string; displayName: string; tiebreakerTotal: number | null }[],
  total: number | null,
  myPlayerId: string | null | undefined,
  leaderIds: string[],
): TiebreakSummary {
  const guesses = entries
    .filter((e) => typeof e.tiebreakerTotal === 'number')
    .map((e) => ({ playerId: e.playerId, displayName: e.displayName, guess: e.tiebreakerTotal! }))
    .sort((a, b) => a.guess - b.guess || a.displayName.localeCompare(b.displayName));
  const n = guesses.length;
  const middle =
    n === 0
      ? null
      : n % 2
        ? guesses[(n - 1) / 2].guess
        : Math.round((guesses[n / 2 - 1].guess + guesses[n / 2].guess) / 2);
  const leaders =
    leaderIds.length > 1
      ? byTiebreakRule(
          guesses.filter((g) => leaderIds.includes(g.playerId)),
          total,
        ).map((g) => ({ ...g, atOrOver: total === null ? null : g.guess >= total }))
      : [];
  return {
    guesses,
    low: n ? guesses[0].guess : null,
    high: n ? guesses[n - 1].guess : null,
    middle,
    mine: guesses.find((g) => g.playerId === myPlayerId)?.guess ?? null,
    leaders,
  };
}
