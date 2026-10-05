/** Data for the results screen: preview, enter results, publish, and record the payout. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../../lib/adminApi';
import { entriesKey } from '../payments/paymentsData';
import { weekKeys } from '../weeks/weekData';

export const previewKey = (year: string, weekId: string) => ['adminPreview', year, weekId] as const;

export function usePreview(year: string, weekId: string, enabled: boolean) {
  return useQuery({
    queryKey: previewKey(year, weekId),
    enabled,
    queryFn: () => adminApi.previewWinner({ year, weekId }),
  });
}

/** Everything that can change after results, a payment, or a publish. */
function useRefresh(year: string, weekId: string) {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: weekKeys.season(year) }),
      client.invalidateQueries({ queryKey: previewKey(year, weekId) }),
      client.invalidateQueries({ queryKey: entriesKey(year, weekId) }),
    ]);
}

export function useEnterResults(year: string, weekId: string) {
  const refresh = useRefresh(year, weekId);
  return useMutation({ mutationFn: adminApi.enterResults, onSuccess: refresh });
}

export function usePublishWinner(year: string, weekId: string) {
  const refresh = useRefresh(year, weekId);
  return useMutation({ mutationFn: adminApi.publishWinner, onSuccess: refresh });
}

export function useMarkPayout(year: string, weekId: string) {
  const refresh = useRefresh(year, weekId);
  return useMutation({ mutationFn: adminApi.markPayout, onSuccess: refresh });
}
