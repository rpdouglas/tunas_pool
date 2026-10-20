/**
 * What players see once picks are revealed (PROJECT_PLAN Sprint 6, docs/DATA_MODEL.md §10): the
 * leaderboard, a mark on every pick, and how the pool split on each game. Pure, so the screens and
 * the tests agree. Nothing here may be shown before `week.revealed` (D-021): the rules keep picks
 * unreadable until then, so there is nothing to compute from.
 */
import { bestPossibleWins, scorePicks, type TieGameRule } from './scoring';
import type { GameResult, Pick } from './types';

export type PickMark = 'correct' | 'missed' | 'pending' | 'blank';

/** ✔ correct, ✖ wrong, ○ not played yet. A blank is a pick that was never made. */
export function pickMark(pick: Pick | undefined, result: GameResult | undefined): PickMark {
  if (!pick) return result ? 'missed' : 'blank';
  if (!result) return 'pending';
  return pick === result ? 'correct' : 'missed';
}

export const PICK_MARK_TEXT: Record<PickMark, { icon: string; label: string }> = {
  correct: { icon: '✔', label: 'Right' },
  missed: { icon: '✖', label: 'Missed' },
  pending: { icon: '○', label: 'Not played yet' },
  blank: { icon: '○', label: 'No pick' },
};

export interface RevealEntry {
  playerId: string;
  displayName: string;
  picks: Record<string, Pick>;
  tiebreakerTotal: number | null;
  submittedAtMs: number;
  /** An entry added or changed after the lock, with the commissioner's approval. */
  late: boolean;
}

export interface LeaderboardRow extends RevealEntry {
  /** 1 for the most wins. Players level on wins share a rank. */
  rank: number;
  tied: boolean;
  wins: number;
  losses: number;
  /** Games with no result yet. */
  remaining: number;
  /** Wins if every remaining pick comes in. */
  bestPossible: number;
}

/**
 * Everyone, most wins first. This is the record only: who can win the pot also depends on who has
 * paid, which players never see (D-036), so the published winner is the word on that.
 */
export function leaderboard(
  entries: RevealEntry[],
  gameIds: string[],
  results: Record<string, GameResult | undefined>,
  tieRule: TieGameRule = 'no_win',
): LeaderboardRow[] {
  const scored = entries
    .map((entry) => {
      const s = scorePicks(entry.picks, results, gameIds, tieRule);
      return { ...entry, ...s, bestPossible: bestPossibleWins(s) };
    })
    .sort((a, b) => b.wins - a.wins || a.displayName.localeCompare(b.displayName));
  return scored.map((row) => ({
    ...row,
    rank: 1 + scored.filter((other) => other.wins > row.wins).length,
    tied: scored.filter((other) => other.wins === row.wins).length > 1,
  }));
}

export interface GameShare {
  away: string[];
  home: string[];
  /** Entries with no pick for this game. */
  blank: string[];
  total: number;
}

/** Who picked each side of a game, by display name, A to Z. */
export function gameShare(gameId: string, entries: RevealEntry[]): GameShare {
  const names = (side: Pick | undefined) =>
    entries
      .filter((e) => e.picks[gameId] === side)
      .map((e) => e.displayName)
      .sort((a, b) => a.localeCompare(b));
  return {
    away: names('away'),
    home: names('home'),
    blank: names(undefined),
    total: entries.length,
  };
}

/** A whole-number percent that never says 0% for someone or 100% when it wasn't everyone. */
export function sharePercent(count: number, total: number): number {
  if (total === 0 || count === 0) return 0;
  if (count === total) return 100;
  return Math.min(99, Math.max(1, Math.round((count / total) * 100)));
}

/**
 * The short line under a decided game, only when it tells you something the bar doesn't: an upset
 * ("Only 7 of 36 picked the Texans.", "Nobody picked the Jets.") or a tie. An ordinary result has
 * no line, since the counts are already beside each team (D-107). It talks about the game, never
 * about anyone being out of it (PERSONAS: the Slump rule). Null before a result.
 */
export function shareLine(
  game: { away: string; home: string },
  share: GameShare,
  result: GameResult | undefined,
): string | null {
  if (!result || share.total === 0) return null;
  if (result === 'tie') return 'This one ended in a tie, so it is not a win for anyone.';
  if (!isUpset(share, result)) return null;
  const winner = result === 'home' ? game.home : game.away;
  const count = share[result].length;
  if (count === 0) return `Nobody picked the ${winner}.`;
  return `Only ${count} of ${share.total} picked the ${winner}.`;
}

/** At or under this share of the pool picked the winner: "Only 7 of 36" and an Upset tag (D-103). */
export const UPSET_SHARE = 0.35;

/** Few people picked the winner. A tie, a game not decided, or nobody entered is never an upset. */
export function isUpset(share: GameShare, result: GameResult | undefined): boolean {
  if (result !== 'away' && result !== 'home') return false;
  if (share.total === 0) return false;
  return share[result].length / share.total <= UPSET_SHARE;
}

/** A plain place number, with "Tied" said in words when players are level. */
export function rankLabel(row: { rank: number; tied: boolean }): string {
  return row.tied ? `Tied ${row.rank}` : String(row.rank);
}
