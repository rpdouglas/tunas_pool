/**
 * The admin's side of claims and merges. Every decision goes through an audited callable
 * (CLAUDE.md §4.5). The tab's count is a plain count of pending claims, so the Back Office header
 * stays cheap; the full list with matches is one callable.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { adminApi } from '../../../lib/adminApi';
import { db } from '../../../lib/firebase';
import { rosterKey } from '../roster/rosterData';

export const claimsListKey = ['adminClaims'] as const;
export const claimsCountKey = ['adminClaimsCount'] as const;

export function usePendingClaimCount() {
  return useQuery({
    queryKey: claimsCountKey,
    queryFn: async () =>
      (
        await getCountFromServer(query(collection(db, 'claims'), where('status', '==', 'pending')))
      ).data().count,
    refetchInterval: 60_000,
  });
}

export function useClaimsList() {
  return useQuery({
    queryKey: claimsListKey,
    queryFn: () => adminApi.listClaims({}),
    refetchInterval: 60_000,
  });
}

function useAfterDecision() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: claimsListKey }),
      client.invalidateQueries({ queryKey: claimsCountKey }),
      client.invalidateQueries({ queryKey: rosterKey }),
      client.invalidateQueries({ queryKey: ['adminEntries'] }), // a merge moves entries
    ]);
}

export function useApproveClaim() {
  const done = useAfterDecision();
  return useMutation({ mutationFn: adminApi.approveClaim, onSuccess: done });
}

export function useRejectClaim() {
  const done = useAfterDecision();
  return useMutation({ mutationFn: adminApi.rejectClaim, onSuccess: done });
}

export function useUnlinkClaim() {
  const done = useAfterDecision();
  return useMutation({ mutationFn: adminApi.unlinkClaim, onSuccess: done });
}

export function useMergePlayers() {
  const done = useAfterDecision();
  return useMutation({ mutationFn: adminApi.mergePlayers, onSuccess: done });
}
