/**
 * When can the commissioner delete a player for good? Only when it changes nothing anyone has seen
 * (D-094): no weeks played, no login linked, no request waiting. Otherwise the answer is a plain
 * sentence that points to what to do instead. Shared so the screen can show the answer before asking
 * for a reason, and the server can enforce it again before it deletes.
 */
import type { PlayerDeleteCheck } from './adminTypes';

export interface PlayerFacts {
  displayName: string;
  origin: 'self' | 'admin';
  /** True when a login is linked to this profile. */
  claimed: boolean;
  /** True for a profile that was merged into another one (already hidden everywhere). */
  merged: boolean;
  /** Every week with an entry for this player, as `{ year, weekId }`. */
  weeks: { year: string; weekId: string }[];
  /** Requests to link a login that are waiting and name this player as the likely match. */
  pendingClaims: number;
}

const weekNo = (weekId: string) => Number(weekId.replace(/\D/g, '')) || 0;

/** "a", "a and b", "a, b and c". */
function joinWords(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** "week 3 of 2026, week 4 of 2026 and 2 more": a short list, so a long history stays readable. */
export function describeWeeks(weeks: PlayerFacts['weeks']): string {
  const labels = [...weeks]
    .sort((a, b) => a.year.localeCompare(b.year) || weekNo(a.weekId) - weekNo(b.weekId))
    .map((w) => `week ${weekNo(w.weekId)} of ${w.year}`);
  if (labels.length <= 3) return joinWords(labels);
  return `${labels.slice(0, 3).join(', ')} and ${labels.length - 3} more`;
}

export function checkPlayerDelete(facts: PlayerFacts): PlayerDeleteCheck {
  const name = facts.displayName;
  if (facts.merged) {
    return {
      ok: false,
      code: 'merged',
      message: `${name} was merged into another player and is already hidden from the roster, so there is nothing to delete.`,
    };
  }
  if (facts.weeks.length > 0) {
    const n = facts.weeks.length;
    return {
      ok: false,
      code: 'played',
      message: `${name} has played ${n === 1 ? 'one week' : `${n} weeks`} (${describeWeeks(facts.weeks)}). Deleting would change past results and pots, so it isn't offered. Make them Inactive to take them off the roster, or merge them if they are a duplicate.`,
    };
  }
  if (facts.claimed) {
    return {
      ok: false,
      code: 'linked',
      message:
        facts.origin === 'admin'
          ? `${name} is linked to a login. Unlink the login first, or make them Inactive.`
          : `${name} signed up on the website with their own login, and deleting would cut it off. Make them Inactive instead.`,
    };
  }
  if (facts.pendingClaims > 0) {
    return {
      ok: false,
      code: 'pending_claim',
      message: `A request to link a login is waiting and points at ${name}. Approve or reject it in Claims first.`,
    };
  }
  return { ok: true };
}
