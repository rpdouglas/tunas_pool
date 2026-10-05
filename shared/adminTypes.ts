/**
 * What the admin callables return (docs/DATA_MODEL.md §5). Shared so the functions and the Back
 * Office screens agree at compile time. Times are epoch milliseconds, not Timestamps, because
 * these cross the network as plain JSON.
 */
import type { DuplicateReason } from './duplicates';
import type { WinnerOutcome } from './scoring';
import type { EntrySource, PaymentMethod, PaymentStatus } from './types';

export interface EntryRow {
  playerId: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  source: string;
  /** Who first entered it: the player on the website, or the admin for them. */
  enteredBy: 'self' | 'admin';
  /** A photo of the paper sheet is stored with the entry. */
  hasPaperPhoto: boolean;
  picksSubmittedAtMs: number | null;
  lateOverride: boolean;
  /** Null when the player hasn't said how they'll pay. */
  paymentMethod: 'cash' | 'etransfer' | null;
  paymentIntent: 'will_do' | 'already_did' | null;
  paymentStatus: 'unpaid' | 'paid';
  paidAtMs: number | null;
  record: { wins: number; losses: number } | null;
  duplicates: { otherPlayerId: string; otherName: string; reasons: DuplicateReason[] }[];
}

export interface EntriesList {
  year: string;
  weekId: string;
  weekNumber: number;
  status: string;
  lockAtMs: number;
  entryFeeCents: number;
  rows: EntryRow[];
}

export interface PreviewContender {
  playerId: string;
  displayName: string;
  wins: number;
  losses: number;
  remaining: number;
  bestPossible: number;
  tiebreakerTotal: number | null;
  paid: boolean;
}

export interface WeekPreview {
  status: string;
  /** Every game has a result and the Monday night total is in. Publishing needs this. */
  complete: boolean;
  gamesWithResults: number;
  totalGames: number;
  mnfTotal: number | null;
  entryFeeCents: number;
  entryCount: number;
  paidCount: number;
  potCents: number;
  unpaidEligibleToWin: boolean;
  contenders: PreviewContender[];
  winner:
    | { ok: true; outcome: WinnerOutcome; explanation: string | null }
    | { ok: false; reason: 'no_eligible_entries' | 'needs_mnf_total' };
}

export type PublishedWinner = WinnerOutcome & { explanation: string | null };

/** One pending claim as the admin sees it. Matches are worked out on demand, never stored. */
export interface ClaimRow {
  claimId: string;
  claimedName: string;
  claimedPhone: string | null;
  requesterEmail: string | null;
  createdAtMs: number;
  /** The website profile this login already has, if any. Approving merges it into the match. */
  requesterProfile: { playerId: string; displayName: string; weeksPlayed: number } | null;
  /** Possible matches, best first. */
  candidates: {
    playerId: string;
    displayName: string;
    phone: string | null;
    reasons: DuplicateReason[];
    /** Already linked to a login, so it can't be approved until it is unlinked. */
    linked: boolean;
    active: boolean;
    weeksPlayed: number;
  }[];
  /** The best match that can still be claimed, or null. */
  suggestedPlayerId: string | null;
  /** Another pending request points at the same suggested profile. */
  sharedSuggestion: boolean;
}

export interface ClaimsList {
  claims: ClaimRow[];
}

export interface ApproveClaimResult {
  playerId: string;
  displayName: string;
  /** True when the claimant's website profile was merged in. A merge can't be undone. */
  merged: boolean;
  /** Weeks moved by the merge, as "2026/wk03". */
  movedWeeks: string[];
}

/**
 * Whether a player can be deleted (D-094). When not, `message` says why and what to do instead, in
 * plain words, ready to show.
 */
export type PlayerDeleteCheck =
  | { ok: true }
  | { ok: false; code: 'merged' | 'played' | 'linked' | 'pending_claim'; message: string };

/**
 * One roster line on the counter screen (D-095). Everything Devon needs to serve the person in front
 * of him, and nothing private: no phone, no email, no note, no picks.
 */
export interface CounterRow {
  playerId: string;
  displayName: string;
  active: boolean;
  /** `self` signed up on the website with their own login; `admin` is on the roster. */
  origin: 'self' | 'admin';
  entered: boolean;
  source: EntrySource | null;
  late: boolean;
  /** Null until the entry has a payment record. */
  paymentStatus: PaymentStatus | null;
  paymentMethod: PaymentMethod | null;
}

export interface CounterOverview {
  rows: CounterRow[];
}

export interface CounterPlayerMatch {
  playerId: string;
  displayName: string;
  reasons: DuplicateReason[];
}

/** Adding or fixing a player. A possible double comes back as `saved: false` so Devon can decide. */
export type CounterSaveResult =
  | { saved: true; playerId: string; created: boolean }
  | { saved: false; matches: CounterPlayerMatch[] };

export interface MergeResult {
  intoId: string;
  movedWeeks: string[];
}

export interface CorrectionResult {
  /** False when the corrected results were the same as the saved ones: nothing was written. */
  changed: boolean;
  winnerChanged: boolean;
  winner: PublishedWinner | null;
}
