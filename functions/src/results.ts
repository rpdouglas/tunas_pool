/** Validation for `adminEnterResults` (pure, unit tested). */
import type { GameResult } from '../../shared/types';

export type ResultsInput =
  | { ok: true; results: Record<string, GameResult>; mnfTotal: number | null }
  | { ok: false; message: string };

const RESULT_VALUES = ['home', 'away', 'tie'];

export function validateResultsInput(
  gameIds: string[],
  results: unknown,
  mnfTotal: unknown,
): ResultsInput {
  if (typeof results !== 'object' || results === null || Array.isArray(results)) {
    return { ok: false, message: 'Results must be a list of winners by game.' };
  }
  const clean: Record<string, GameResult> = {};
  for (const [id, value] of Object.entries(results)) {
    if (!gameIds.includes(id))
      return { ok: false, message: `"${id}" is not a game on this week's sheet.` };
    if (!RESULT_VALUES.includes(value as string)) {
      return {
        ok: false,
        message: `The result for ${id} must be the home team, the away team, or a tie.`,
      };
    }
    clean[id] = value as GameResult;
  }
  if (mnfTotal !== null && mnfTotal !== undefined) {
    if (
      typeof mnfTotal !== 'number' ||
      !Number.isInteger(mnfTotal) ||
      mnfTotal < 0 ||
      mnfTotal > 200
    ) {
      return { ok: false, message: 'The Monday night total must be a whole number from 0 to 200.' };
    }
  }
  return { ok: true, results: clean, mnfTotal: typeof mnfTotal === 'number' ? mnfTotal : null };
}

/** Same keys and values, in any order. */
export function sameResults(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  const x = a ?? {};
  const y = b ?? {};
  const keys = Object.keys(x);
  return keys.length === Object.keys(y).length && keys.every((k) => x[k] === y[k]);
}
