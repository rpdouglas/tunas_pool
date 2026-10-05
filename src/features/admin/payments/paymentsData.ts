/**
 * The payments queue's data (CLAUDE.md §5). One server call lists the week's entries; marking paid
 * updates the screen immediately and rolls back if the server says no, so the commissioner never
 * waits on a weak signal at the counter.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EntriesList } from '@shared/adminTypes';
import type { PaymentMethod } from '@shared/types';
import { adminApi } from '../../../lib/adminApi';

export const entriesKey = (year: string, weekId: string) => ['adminEntries', year, weekId] as const;

export function useEntriesList(year: string, weekId: string | undefined) {
  return useQuery({
    queryKey: entriesKey(year, weekId ?? ''),
    enabled: Boolean(weekId),
    queryFn: () => adminApi.listEntries({ year, weekId: weekId! }),
    refetchInterval: 60_000, // new entries arrive all week; React Query pauses this in a background tab
  });
}

export interface SetPaymentVars {
  playerId: string;
  status: 'paid' | 'unpaid';
  method?: PaymentMethod;
}

export function useSetPayment(year: string, weekId: string) {
  const client = useQueryClient();
  const key = entriesKey(year, weekId);
  return useMutation({
    mutationFn: (vars: SetPaymentVars) => adminApi.setPayment({ year, weekId, ...vars }),
    onMutate: async (vars) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<EntriesList>(key);
      if (previous) {
        client.setQueryData<EntriesList>(key, {
          ...previous,
          rows: previous.rows.map((row) =>
            row.playerId !== vars.playerId
              ? row
              : {
                  ...row,
                  paymentStatus: vars.status,
                  paymentMethod: vars.method ?? row.paymentMethod,
                  paymentIntent: vars.status === 'paid' ? 'already_did' : row.paymentIntent,
                  paidAtMs: vars.status === 'paid' ? Date.now() : null,
                },
          ),
        });
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
}
