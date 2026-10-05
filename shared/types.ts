/**
 * Shared types for the web app and Cloud Functions.
 * Source of truth: docs/DATA_MODEL.md. Update both in the same commit.
 *
 * TimestampLike is structural so it matches both the client SDK Timestamp and
 * the Admin SDK Timestamp without importing either.
 */
export interface TimestampLike {
  seconds: number;
  nanoseconds: number;
  toDate(): Date;
}

// ---- Enums -----------------------------------------------------------------
export type PaymentMethod = 'cash' | 'etransfer';
export type PaymentIntent = 'will_do' | 'already_did';
export type PaymentStatus = 'unpaid' | 'paid';
export type WeekStatus = 'draft' | 'open' | 'locked' | 'final';
export type EntrySource = 'web' | 'paper' | 'text' | 'phone';
export type ClaimStatus = 'pending' | 'approved' | 'rejected';
export type Pick = 'home' | 'away';
export type GameResult = 'home' | 'away' | 'tie';
export type PlayerOrigin = 'self' | 'admin';
export type GameSlot = 'sunday' | 'mnf';

export type AuditAction =
  | 'payment.set'
  | 'entry.adminUpsert'
  | 'entry.lateOverride'
  | 'entry.delete'
  | 'week.status'
  | 'week.results'
  | 'week.winnerPublished'
  | 'week.payout'
  | 'week.correction'
  | 'claim.approved'
  | 'claim.rejected'
  | 'claim.unlinked'
  | 'player.merged'
  | 'player.guestMoved';

// ---- players/{playerId} ----------------------------------------------------
export interface Player {
  displayName: string;
  phone: string | null; // E.164, private
  email: string | null; // private
  claimedByUid: string | null; // never client-writable
  origin: PlayerOrigin;
  usualPayment: PaymentMethod | null;
  ageAttestedAt?: TimestampLike | null; // server time of "I'm 18 or older" (D-037)
  notes?: string | null; // admin-only
  mergedInto?: string | null;
  active: boolean;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

export interface PlayerStats {
  weeksPlayed: number;
  wins: number;
  losses: number;
  weeklyTitles: number;
  bestWeekRecord: { wins: number; losses: number } | null;
  lastPlayedWeek: string | null;
  updatedAt: TimestampLike;
}

// ---- claims/{claimId} ------------------------------------------------------
export interface Claim {
  requesterUid: string;
  requesterEmail: string | null;
  claimedName: string;
  claimedPhone: string;
  status: ClaimStatus;
  suggestedPlayerId: string | null;
  resolvedPlayerId: string | null;
  decidedBy?: string;
  decidedAt?: TimestampLike;
  decisionNote?: string;
  createdAt: TimestampLike;
}

// ---- seasons/{year} --------------------------------------------------------
export interface Season {
  year: string;
  status: 'active' | 'archived';
  entryFeeCents: number;
  createdAt: TimestampLike;
}

export interface Game {
  id: string; // "g01".."g14", "mnf"
  order: number; // 1..15, matches the paper sheet
  away: string;
  home: string;
  venueNote?: string;
  kickoff: TimestampLike;
  slot: GameSlot;
}

export type WinnerDecision = 'most_wins' | 'tiebreaker' | 'split_pot';

export interface WeekWinner {
  playerIds: string[]; // more than one = split pot
  displayNames: string[]; // denormalized for banners
  record: { wins: number; losses: number };
  mnfPrediction: number | null;
  decision: WinnerDecision; // how it was decided, for "How this was decided"
  tiedPlayerIds: string[]; // who tied for the most wins before the tiebreaker
  potCents: number;
  shareCents: number; // each winner's share, rounded down
  leftoverCents: number; // cents that did not divide evenly, shown to the admin (D-046)
  publishedAt: TimestampLike;
}

export interface Week {
  weekNumber: number;
  status: WeekStatus;
  lockAt: TimestampLike;
  revealed: boolean;
  games: Game[];
  mnfGameId: string;
  results: Record<string, GameResult>;
  mnfTotal: number | null;
  entryFeeCents: number;
  entryCount: number; // function-written (onEntryWritten)
  paidCount: number; // function-written; pot = paidCount * entryFeeCents
  winner: WeekWinner | null;
  payoutSent: boolean;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

// ---- entries ---------------------------------------------------------------
/** Public: readable by every signed-in player. No payment, picks, or phone (D-036). */
export interface Entry {
  playerId: string; // equals the document ID
  displayName: string;
  enteredBy: 'self' | 'admin';
  source: EntrySource;
  paperPhotoPath: string | null;
  lateOverride: { reason: string; by: string; at: TimestampLike } | null;
  picksSubmittedAt: TimestampLike; // server time of the latest submit or edit (D-040)
  /** Function-written by `onResultsWritten` once results are in. Never client-writable. */
  record?: { wins: number; losses: number };
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

/** entries/{playerId}/payment/current: owner and admin only, never revealed (D-036). */
export interface EntryPayment {
  paymentMethod: PaymentMethod;
  paymentIntent: PaymentIntent;
  paymentStatus: PaymentStatus; // admin/functions only
  paidAt?: TimestampLike;
  paidBy?: string;
  updatedAt: TimestampLike;
}

export interface EntryPicks {
  picks: Record<string, Pick>; // gameId -> pick, up to 15 keys
  tiebreakerTotal: number;
  updatedAt: TimestampLike;
}

// ---- derived / config ------------------------------------------------------
export interface Standing {
  displayName: string;
  weeksPlayed: number;
  wins: number;
  losses: number;
  weeklyTitles: number;
  weekRecords: Record<string, { wins: number; losses: number }>;
  updatedAt: TimestampLike;
}

export interface PoolConfig {
  entryFeeCents: number;
  etransferEmail: string;
  etransferInstructions: string;
  contactEmail: string;
  defaultLockRule: string; // e.g. "Saturday 23:59 America/Toronto"
  tieGameRule: 'no_win' | 'win_for_all' | 'half_win';
  unpaidEligibleToWin: boolean;
}

export interface AuditLogEntry {
  at: TimestampLike;
  actorUid: string;
  action: AuditAction;
  target: string; // document path
  before: unknown;
  after: unknown;
  reason?: string;
  year?: string;
  weekId?: string;
}
