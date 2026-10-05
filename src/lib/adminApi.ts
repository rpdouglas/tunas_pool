/** Typed wrappers for the admin callables (docs/DATA_MODEL.md §5). Every one is admin-only on the server. */
import { httpsCallable } from 'firebase/functions';
import type { EntriesList, PublishedWinner, WeekPreview } from '@shared/adminTypes';
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
  previewWinner: callable<WeekArgs, WeekPreview>('adminPreviewWinner'),
  publishWinner: callable<WeekArgs & { expectedPlayerIds: string[] }, PublishedWinner>(
    'adminPublishWinner',
  ),
  markPayout: callable<WeekArgs & { sent: boolean }, { changed: boolean; payoutSent: boolean }>(
    'adminMarkPayout',
  ),
};
