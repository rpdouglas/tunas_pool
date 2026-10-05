/**
 * What the admin callables return (docs/DATA_MODEL.md §5). Shared so the functions and the Back
 * Office screens agree at compile time. Times are epoch milliseconds, not Timestamps, because
 * these cross the network as plain JSON.
 */
import type { DuplicateReason } from './duplicates';
import type { WinnerOutcome } from './scoring';

export interface EntryRow {
  playerId: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  source: string;
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
