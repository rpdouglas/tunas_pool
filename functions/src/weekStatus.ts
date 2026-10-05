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
