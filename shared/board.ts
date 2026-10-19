/**
 * The weekly board's plain logic (D-102), shared by the screen and its tests. The database rules
 * decide for real (firestore.rules, the board section); this only says the same thing in words
 * before anyone taps.
 */

export const MAX_MESSAGE_LENGTH = 500;
export const EDIT_WINDOW_MS = 10 * 60_000;
export const BOARD_OPEN_AFTER_WINNER_MS = 3 * 24 * 60 * 60_000;

export const HOUSE_RULES =
  'House rules: no threats of violence, and leave everybody’s mom out of it.';

export interface BoardViewer {
  /** The commissioner or the counter role. */
  staff: boolean;
  /** Has an entry this week. */
  entered: boolean;
  /** Signed in with Google or email, not as a guest. */
  savedAccount: boolean;
  /** Their entry is marked paid. */
  paid: boolean;
  /** Muted on this week's board. */
  muted: boolean;
  /** The board takes posts right now. */
  open: boolean;
  /** Picks can still be made this week (for the "make your picks" nudge). */
  picksOpen: boolean;
}

export interface BoardAccess {
  canRead: boolean;
  canPost: boolean;
  /** Why they can't read or post, in plain words, or null. */
  note: string | null;
  /** The note's next step, when there is one. */
  action: 'make-picks' | 'save-account' | null;
}

export function boardAccess(v: BoardViewer): BoardAccess {
  if (!v.staff && !v.entered) {
    return v.picksOpen
      ? {
          canRead: false,
          canPost: false,
          note: "The board is for this week's players. Make your picks to join in.",
          action: 'make-picks',
        }
      : {
          canRead: false,
          canPost: false,
          note: "The board is for this week's players.",
          action: null,
        };
  }
  const read = { canRead: true, canPost: false, action: null } as const;
  if (!v.open) return { ...read, note: 'The board is closed for this week.' };
  if (!v.entered) return { ...read, note: 'You are reading as the pool. Players post here.' };
  if (v.muted) return { ...read, note: 'The pool has paused your posts on this week’s board.' };
  if (!v.savedAccount) {
    return {
      ...read,
      note: 'Save your account with Google or email to post. Guests can read along.',
      action: 'save-account',
    };
  }
  if (!v.paid) return { ...read, note: 'You can post once the pool confirms your payment.' };
  return { canRead: true, canPost: true, note: null, action: null };
}

/** Open from the week opening until three days after the winner is published. */
export function boardIsOpen(
  week: { status: string; winnerPublishedAtMs: number | null },
  nowMs: number,
): boolean {
  if (week.status === 'open' || week.status === 'locked') return true;
  return (
    week.status === 'final' &&
    week.winnerPublishedAtMs !== null &&
    nowMs < week.winnerPublishedAtMs + BOARD_OPEN_AFTER_WINNER_MS
  );
}

/** Your own post, not hidden, within ten minutes of posting. */
export function canChangeMessage(
  message: { playerId: string; hidden: boolean; createdAtMs: number },
  myPlayerId: string | null,
  canPost: boolean,
  nowMs: number,
): boolean {
  return (
    canPost &&
    message.playerId === myPlayerId &&
    !message.hidden &&
    nowMs < message.createdAtMs + EDIT_WINDOW_MS
  );
}

/** Trimmed text, or a plain reason it can't be posted. */
export function checkMessage(
  text: string,
): { ok: true; text: string } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, message: 'Write something first.' };
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, message: `Keep it under ${MAX_MESSAGE_LENGTH} characters.` };
  }
  return { ok: true, text: trimmed };
}
