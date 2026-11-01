/**
 * Pure decision logic for `adminSetWeekStatus`, kept apart from Firestore so it can be unit tested.
 */
import type { Game, WeekStatus } from '../../shared/types';
import { canChangeStatus, weekProblems, type GameDraft } from '../../shared/weeks';

export interface WeekSnapshot {
  status: WeekStatus;
  lockAtMs: number;
  games: GameDraft[];
  mnfGameId: string;
}

export type StatusPlan =
  | { ok: true; update: { status: WeekStatus; revealed?: boolean } }
  | { ok: false; code: 'failed-precondition'; message: string };

export function toGameDraft(game: Game): GameDraft {
  return { ...game, kickoffMs: game.kickoff.toDate().getTime() };
}

export function planStatusChange(
  week: WeekSnapshot,
  to: WeekStatus,
  nowMs: number,
  entryCount: number,
): StatusPlan {
  if (!canChangeStatus(week.status, to)) {
    return {
      ok: false,
      code: 'failed-precondition',
      message: `A ${week.status} week can't be moved to ${to}.`,
    };
  }
  if (to === 'open') {
    const problems = weekProblems(week, nowMs);
    if (problems.length > 0) {
      return {
        ok: false,
        code: 'failed-precondition',
        message: `This week isn't ready to open: ${problems.join(' ')}`,
      };
    }
    return { ok: true, update: { status: 'open' } };
  }
  if (to === 'draft') {
    if (entryCount > 0) {
      return {
        ok: false,
        code: 'failed-precondition',
        message:
          'Players have already entered this week, so it stays open. Lock it instead if you need to stop entries.',
      };
    }
    return { ok: true, update: { status: 'draft' } };
  }
  // open -> locked: the same end state as the scheduled lock, including the reveal.
  return { ok: true, update: { status: 'locked', revealed: true } };
}

export interface ReopenSnapshot extends WeekSnapshot {
  backfilled: boolean;
  resultCount: number;
  mnfTotal: number | null;
  hasWinner: boolean;
}

export type ReopenPlan =
  | { ok: true; update: { status: 'open'; revealed: false; lockAtMs: number } }
  | { ok: false; code: 'failed-precondition' | 'invalid-argument'; message: string };

/**
 * `adminReopenWeek` (D-145): put a locked week back to open with a new lock time, before any game
 * has been played. The new lock must pass the same checks as opening a week (in the future, before
 * the first kickoff), judged by the server clock. Picks are hidden again until the new lock.
 */
export function planReopen(week: ReopenSnapshot, newLockAtMs: unknown, nowMs: number): ReopenPlan {
  if (week.status !== 'locked') {
    return {
      ok: false,
      code: 'failed-precondition',
      message:
        week.status === 'final'
          ? "The winner is already published, so this week can't be reopened."
          : `Only a locked week can be reopened. This week is ${week.status}.`,
    };
  }
  if (week.backfilled) {
    return {
      ok: false,
      code: 'failed-precondition',
      message: "This week was backfilled from paper sheets, so it can't be reopened.",
    };
  }
  if (week.resultCount > 0 || week.mnfTotal !== null || week.hasWinner) {
    return {
      ok: false,
      code: 'failed-precondition',
      message: "Results are already in for this week, so picks can't be reopened.",
    };
  }
  if (typeof newLockAtMs !== 'number' || !Number.isFinite(newLockAtMs)) {
    return { ok: false, code: 'invalid-argument', message: 'Pick a new lock date and time.' };
  }
  const problems = weekProblems({ ...week, lockAtMs: newLockAtMs }, nowMs);
  if (problems.length > 0) {
    return {
      ok: false,
      code: 'failed-precondition',
      message: `That lock time won't work: ${problems.join(' ')}`,
    };
  }
  return { ok: true, update: { status: 'open', revealed: false, lockAtMs: newLockAtMs } };
}
