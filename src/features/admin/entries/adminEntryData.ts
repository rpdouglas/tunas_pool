/**
 * Data for the "Entering for" screen. Reads are direct (the rules let an admin read any entry, its
 * picks, and its payment). Every write goes through an audited callable: `adminUpsertEntry` while
 * the week is open, `adminLateOverride` after the lock, `adminDeleteEntry` to remove one.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import type { AdminEntry } from '@shared/paperEntry';
import type { Entry, EntryPayment, EntryPicks, Player } from '@shared/types';
import { adminApi } from '../../../lib/adminApi';
import { db } from '../../../lib/firebase';
import { entriesKey } from '../payments/paymentsData';

export interface AdminEntryView {
  player: (Pick<Player, 'displayName' | 'usualPayment' | 'active'> & { playerId: string }) | null;
  entry: Entry | null;
  picks: EntryPicks | null;
  payment: EntryPayment | null;
}

export const adminEntryKey = (year: string, weekId: string, playerId: string) =>
  ['adminEntry', year, weekId, playerId] as const;

export function useAdminEntry(year: string, weekId: string | undefined, playerId: string) {
  return useQuery({
    queryKey: adminEntryKey(year, weekId ?? '', playerId),
    enabled: Boolean(weekId),
    queryFn: async (): Promise<AdminEntryView> => {
      const base = `seasons/${year}/weeks/${weekId}/entries/${playerId}`;
      const [player, entry, picks, payment] = await Promise.all([
        getDoc(doc(db, 'players', playerId)),
        getDoc(doc(db, base)),
        getDoc(doc(db, `${base}/private/picks`)),
        getDoc(doc(db, `${base}/payment/current`)),
      ]);
      const p = player.exists() ? (player.data() as Player) : null;
      return {
        player: p
          ? {
              playerId,
              displayName: p.displayName,
              usualPayment: p.usualPayment ?? null,
              active: p.active !== false,
            }
          : null,
        entry: entry.exists() ? (entry.data() as Entry) : null,
        picks: picks.exists() ? (picks.data() as EntryPicks) : null,
        payment: payment.exists() ? (payment.data() as EntryPayment) : null,
      };
    },
  });
}

export interface SaveAdminEntryVars {
  entry: AdminEntry;
  /** Set for a late entry: the typed reason. */
  reason?: string;
}

export function useSaveAdminEntry(year: string, weekId: string, playerId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ entry, reason }: SaveAdminEntryVars) =>
      reason === undefined
        ? adminApi.upsertEntry({ year, weekId, playerId, entry })
        : adminApi.lateOverride({ year, weekId, playerId, entry, reason }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: entriesKey(year, weekId) }),
        client.invalidateQueries({ queryKey: adminEntryKey(year, weekId, playerId) }),
      ]),
  });
}

export function useDeleteAdminEntry(year: string, weekId: string, playerId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => adminApi.deleteEntry({ year, weekId, playerId, reason }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: entriesKey(year, weekId) }),
        client.invalidateQueries({ queryKey: adminEntryKey(year, weekId, playerId) }),
      ]),
  });
}
