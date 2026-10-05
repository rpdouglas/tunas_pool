/**
 * What the admin sends when entering picks for someone (paper sheet, text, or phone call), checked
 * the same way on the screen and in the callables `adminUpsertEntry` and `adminLateOverride`
 * (docs/DATA_MODEL.md §5). Pure, so every case is unit tested.
 */
import type { EntrySource, PaymentMethod, Pick } from './types';

export const ENTRY_SOURCES: EntrySource[] = ['paper', 'text', 'phone', 'web'];

export const SOURCE_LABELS: Record<EntrySource, string> = {
  paper: 'Paper',
  text: 'Text',
  phone: 'Phone',
  web: 'Website',
};

export const MAX_TIEBREAKER = 200;
export const MIN_REASON_LENGTH = 5;
export const MAX_REASON_LENGTH = 300;

/** Paper-sheet photos live under this folder in the pool's own bucket (D-029). */
export function paperPhotoFolder(year: string, weekId: string): string {
  return `paperSheets/${year}/${weekId}/`;
}

export interface AdminEntry {
  source: EntrySource;
  /** A blank on the sheet is simply left out: it scores as a miss. */
  picks: Record<string, Pick>;
  tiebreakerTotal: number;
  /** Storage path of the sheet's photo, or null for none. */
  paperPhotoPath: string | null;
  /** Mark the entry paid in the same save, when the money is handed over with the sheet. */
  markPaid: PaymentMethod | null;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const fail = (message: string): Parsed<never> => ({ ok: false, message });

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Reads the callable's input. The Firebase client sends an omitted field as null, so null and
 * undefined mean the same thing here: no photo, and no payment taken.
 */
export function parseAdminEntry(
  data: unknown,
  week: { year: string; weekId: string; gameIds: string[] },
): Parsed<AdminEntry> {
  const input = asRecord(data) ?? {};

  const source = input.source;
  if (typeof source !== 'string' || !ENTRY_SOURCES.includes(source as EntrySource)) {
    return fail('Say how the picks came in: paper, text, or phone.');
  }

  const rawPicks = asRecord(input.picks);
  if (!rawPicks) return fail('The picks are missing.');
  const picks: Record<string, Pick> = {};
  for (const [gameId, side] of Object.entries(rawPicks)) {
    if (!week.gameIds.includes(gameId))
      return fail("One of the picks is for a game that isn't on this week's sheet.");
    if (side !== 'home' && side !== 'away') return fail('Each pick must be one of the two teams.');
    picks[gameId] = side;
  }
  if (Object.keys(picks).length === 0) return fail('Enter at least one pick.');

  const tiebreakerTotal = input.tiebreakerTotal;
  if (
    typeof tiebreakerTotal !== 'number' ||
    !Number.isInteger(tiebreakerTotal) ||
    tiebreakerTotal < 0 ||
    tiebreakerTotal > MAX_TIEBREAKER
  ) {
    return fail(`The tiebreaker must be a whole number from 0 to ${MAX_TIEBREAKER}.`);
  }

  const paperPhotoPath = input.paperPhotoPath ?? null;
  if (paperPhotoPath !== null) {
    const folder = paperPhotoFolder(week.year, week.weekId);
    const ok =
      typeof paperPhotoPath === 'string' &&
      paperPhotoPath.startsWith(folder) &&
      /^[A-Za-z0-9_.-]{1,120}$/.test(paperPhotoPath.slice(folder.length));
    if (!ok) return fail("The photo isn't in this week's folder.");
  }

  const markPaid = input.markPaid ?? null;
  if (markPaid !== null && markPaid !== 'cash' && markPaid !== 'etransfer') {
    return fail('Payment must be cash or e-Transfer.');
  }

  return {
    ok: true,
    value: {
      source: source as EntrySource,
      picks,
      tiebreakerTotal,
      paperPhotoPath: paperPhotoPath as string | null,
      markPaid: markPaid as PaymentMethod | null,
    },
  };
}

/** The typed reason for a late entry or for removing an entry. It is shown in the audit log. */
export function parseReason(value: unknown, what: string): Parsed<string> {
  const reason = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (reason.length < MIN_REASON_LENGTH) return fail(`Type a short reason for ${what}.`);
  if (reason.length > MAX_REASON_LENGTH) {
    return fail(`Keep the reason under ${MAX_REASON_LENGTH} characters.`);
  }
  return { ok: true, value: reason };
}

/** Games on the sheet with no pick, in sheet order. */
export function blankGames<G extends { id: string }>(
  games: G[],
  picks: Record<string, unknown>,
): G[] {
  return games.filter((g) => picks[g.id] !== 'home' && picks[g.id] !== 'away');
}

export type EntryWindow = { mode: 'open' } | { mode: 'late' } | { mode: 'closed'; message: string };

/**
 * Which callable applies right now. While the week is open and the lock time has not passed, it is
 * a normal admin entry. Once picks are locked it is a late entry with a reason, until the winner is
 * published (corrections after that arrive in Sprint 6, D-047).
 */
export function entryWindow(
  week: { status: string; lockAtMs: number },
  nowMs: number,
): EntryWindow {
  if (week.status === 'draft') {
    return { mode: 'closed', message: "This week isn't open yet. Open it before entering picks." };
  }
  if (week.status === 'final') {
    return {
      mode: 'closed',
      message: 'The winner is published, so entries for this week are closed.',
    };
  }
  if (week.status === 'open' && nowMs < week.lockAtMs) return { mode: 'open' };
  return { mode: 'late' };
}
