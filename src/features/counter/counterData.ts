/**
 * Data for the Counter screens (D-095). Everything comes from the server's `counterOverview`, which
 * leaves out phones, emails, notes, and picks, and every change goes through an audited callable
 * that applies the counter role's limits. No raw Firestore reads of private data here.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../lib/adminApi';

export const counterKey = (year: string, weekId: string) =>
  ['counterOverview', year, weekId] as const;

export function useCounterOverview(year: string, weekId: string | undefined) {
  return useQuery({
    queryKey: counterKey(year, weekId ?? ''),
    enabled: Boolean(weekId),
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: () => adminApi.counterOverview({ year, weekId: weekId! }),
  });
}

/** Mark cash received, or undo it. The server refuses an e-Transfer either way. */
export function useCashPayment(year: string, weekId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ playerId, status }: { playerId: string; status: 'paid' | 'unpaid' }) =>
      adminApi.setPayment({
        year,
        weekId,
        playerId,
        status,
        ...(status === 'paid' ? { method: 'cash' as const } : {}),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: counterKey(year, weekId) }),
  });
}

export function useCounterSavePlayer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: adminApi.counterSavePlayer,
    onSuccess: () => client.invalidateQueries({ queryKey: ['counterOverview'] }),
  });
}
