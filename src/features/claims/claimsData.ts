/**
 * The player's side of claims (CLAUDE.md §5: no raw getDoc in components). A player can read their
 * own claim documents, which hold only what they typed and the decision, and asks through the
 * `requestClaim` callable. They never see anything about the profile they named until the admin
 * approves and it becomes theirs.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { Claim, ClaimStatus, Entry, EntryPicks, Player } from '@shared/types';
import { db, functions } from '../../lib/firebase';
import { weekConverter, type WeekView } from '../../lib/weekModel';
import { findMyProfile } from '../entry/entryData';

export const claimKeys = {
  profile: (uid: string) => ['myProfile', uid] as const,
  claims: (uid: string) => ['myClaims', uid] as const,
  history: (playerId: string) => ['myHistory', playerId] as const,
  picks: (year: string, weekId: string, playerId: string) =>
    ['myHistoryPicks', year, weekId, playerId] as const,
};

export interface MyProfile {
  playerId: string;
  displayName: string;
  /** True when this login is linked to a profile the pool keeps (paper, text, or phone history). */
  linkedToRoster: boolean;
}

export function useMyProfile(uid: string | undefined) {
  return useQuery({
    queryKey: claimKeys.profile(uid ?? ''),
    enabled: Boolean(uid),
    queryFn: async (): Promise<MyProfile | null> => {
      const found = await findMyProfile(uid!);
      if (!found) return null;
      const data: Player = found.data;
      return {
        playerId: found.id,
        displayName: data.displayName,
        linkedToRoster: data.origin === 'admin',
      };
    },
  });
}

export interface MyClaim {
  claimId: string;
  claimedName: string;
  claimedPhone: string | null;
  status: ClaimStatus;
  decisionNote: string | null;
  createdAtMs: number;
}

/** This login's requests, newest first. While one is waiting, check back every half minute. */
export function useMyClaims(uid: string | undefined) {
  return useQuery({
    queryKey: claimKeys.claims(uid ?? ''),
    enabled: Boolean(uid),
    queryFn: async (): Promise<MyClaim[]> => {
      // The rules only allow this exact filter (FIRESTORE_RULES row 45).
      const snap = await getDocs(query(collection(db, 'claims'), where('requesterUid', '==', uid)));
      return snap.docs
        .map((d) => {
          const c = d.data() as Claim;
          return {
            claimId: d.id,
            claimedName: c.claimedName,
            claimedPhone: c.claimedPhone ?? null,
            status: c.status,
            decisionNote: c.decisionNote ?? null,
            createdAtMs: c.createdAt?.toDate().getTime() ?? 0,
          };
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
    },
    refetchInterval: (q) => (q.state.data?.[0]?.status === 'pending' ? 30_000 : false),
  });
}

export function useRequestClaim(uid: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { claimedName: string; claimedPhone: string | null }) =>
      (await httpsCallable<typeof input, { status: 'pending' }>(functions, 'requestClaim')(input))
        .data,
    onSuccess: () => client.invalidateQueries({ queryKey: claimKeys.claims(uid) }),
  });
}

export interface HistoryWeek {
  week: WeekView;
  record: { wins: number; losses: number } | null;
  lateOverride: boolean;
  submittedAtMs: number;
}

/**
 * Every week this player has an entry in, newest first, across seasons. Test seasons are left out
 * (D-044). A handful of small reads: the seasons, each season's weeks, and one entry per week.
 */
export function useMyHistory(playerId: string | undefined) {
  return useQuery({
    queryKey: claimKeys.history(playerId ?? ''),
    enabled: Boolean(playerId),
    queryFn: async (): Promise<HistoryWeek[]> => {
      const seasons = (await getDocs(collection(db, 'seasons'))).docs
        .map((d) => d.id)
        .filter((id) => !id.endsWith('-test'));
      const weeks = (
        await Promise.all(
          seasons.map(async (year) => {
            const snap = await getDocs(
              query(
                collection(db, 'seasons', year, 'weeks').withConverter(weekConverter),
                // Players can only list weeks filtered away from drafts (FIRESTORE_RULES row 36).
                where('status', 'in', ['open', 'locked', 'final']),
              ),
            );
            return snap.docs.map((d) => d.data());
          }),
        )
      ).flat();
      const rows = await Promise.all(
        weeks.map(async (week): Promise<HistoryWeek | null> => {
          const snap = await getDoc(
            doc(db, 'seasons', week.year, 'weeks', week.id, 'entries', playerId!),
          );
          if (!snap.exists()) return null;
          const entry = snap.data() as Entry;
          return {
            week,
            record: entry.record ?? null,
            lateOverride: Boolean(entry.lateOverride),
            submittedAtMs: entry.picksSubmittedAt?.toDate().getTime() ?? 0,
          };
        }),
      );
      return rows
        .filter((r): r is HistoryWeek => r !== null)
        .sort(
          (a, b) => b.week.year.localeCompare(a.week.year) || b.week.weekNumber - a.week.weekNumber,
        );
    },
  });
}

/** One week's picks, read when the player opens that week. */
export function useMyHistoryPicks(
  year: string,
  weekId: string,
  playerId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: claimKeys.picks(year, weekId, playerId),
    enabled,
    queryFn: async (): Promise<EntryPicks | null> => {
      const snap = await getDoc(
        doc(db, 'seasons', year, 'weeks', weekId, 'entries', playerId, 'private', 'picks'),
      );
      return snap.exists() ? (snap.data() as EntryPicks) : null;
    },
  });
}
