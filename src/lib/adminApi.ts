/** Typed wrappers for the admin callables (docs/DATA_MODEL.md §5). Every one is admin-only on the server. */
import { httpsCallable } from 'firebase/functions';
import type {
  ApproveClaimResult,
  ClaimsList,
  CorrectionResult,
  EntriesList,
  MergeResult,
  PublishedWinner,
  WeekPreview,
} from '@shared/adminTypes';
import type { AdminEntry } from '@shared/paperEntry';
import type { SeasonReport } from '@shared/reports';
import type { GameResult, PaymentMethod } from '@shared/types';
import { functions } from './firebase';

function callable<Req, Res>(name: string) {
  return async (data: Req): Promise<Res> =>
    (await httpsCallable<Req, Res>(functions, name)(data)).data;
}

interface WeekArgs {
  year: string;
  weekId: string;
}

export interface UpsertEntryResult {
  created: boolean;
  late: boolean;
  paid: boolean;
  picksSubmittedAtMs: number | null;
}

/** A season and how its weeks stand (functions/src/seasons.ts). */
export interface SeasonSummary {
  year: string;
  status: 'active' | 'archived';
  weeks: number;
  finalWeeks: number;
  liveWeeks: number;
  draftWeeks: number;
  test: boolean;
}

export const adminApi = {
  listEntries: callable<WeekArgs, EntriesList>('adminListEntries'),
  setPayment: callable<
    WeekArgs & { playerId: string; status: 'paid' | 'unpaid'; method?: PaymentMethod },
    { changed: boolean; status: string }
  >('adminSetPayment'),
  enterResults: callable<
    WeekArgs & { results: Record<string, GameResult>; mnfTotal: number | null },
    { changed: boolean }
  >('adminEnterResults'),
  correctResults: callable<
    WeekArgs & { results: Record<string, GameResult>; mnfTotal: number; reason: string },
    CorrectionResult
  >('adminCorrectResults'),
  previewWinner: callable<WeekArgs, WeekPreview>('adminPreviewWinner'),
  publishWinner: callable<WeekArgs & { expectedPlayerIds: string[] }, PublishedWinner>(
    'adminPublishWinner',
  ),
  markPayout: callable<WeekArgs & { sent: boolean }, { changed: boolean; payoutSent: boolean }>(
    'adminMarkPayout',
  ),
  upsertEntry: callable<WeekArgs & { playerId: string; entry: AdminEntry }, UpsertEntryResult>(
    'adminUpsertEntry',
  ),
  lateOverride: callable<
    WeekArgs & { playerId: string; entry: AdminEntry; reason: string },
    UpsertEntryResult
  >('adminLateOverride'),
  deleteEntry: callable<WeekArgs & { playerId: string; reason: string }, { deleted: true }>(
    'adminDeleteEntry',
  ),
  seasonReport: callable<{ year: string }, SeasonReport>('adminSeasonReport'),
  recomputeStandings: callable<
    { year: string },
    { year: string; players: number; removed: number; allTime: number }
  >('adminRecomputeStandings'),
  listSeasons: callable<Record<string, never>, { seasons: SeasonSummary[] }>('adminListSeasons'),
  setSeasonStatus: callable<{ year: string; status: 'active' | 'archived' }, SeasonSummary>(
    'adminSetSeasonStatus',
  ),
  listClaims: callable<Record<string, never>, ClaimsList>('adminListClaims'),
  approveClaim: callable<{ claimId: string; playerId: string }, ApproveClaimResult>(
    'adminApproveClaim',
  ),
  rejectClaim: callable<{ claimId: string; note: string | null }, { status: 'rejected' }>(
    'adminRejectClaim',
  ),
  unlinkClaim: callable<{ playerId: string }, { unlinked: true }>('adminUnlinkClaim'),
  mergePlayers: callable<{ fromId: string; intoId: string }, MergeResult>('adminMergePlayers'),
};
