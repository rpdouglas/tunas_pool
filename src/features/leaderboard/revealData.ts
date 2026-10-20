/**
 * Data for the week page (CLAUDE.md §5: no raw getDoc in components). Everyone's picks are read
 * only once `week.revealed` is true: before that the rules refuse the reads anyway (CLAUDE.md §4.3),
 * so the screen never asks.
 */
import { useQuery } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import type { RevealEntry } from '@shared/reveal';
import type { FeedScore } from '@shared/schedule';
import type { Entry, EntryPicks } from '@shared/types';
import { db } from '../../lib/firebase';
import { fetchWeekScores } from '../../lib/scoresFeed';
import { weekConverter, type WeekView } from '../../lib/weekModel';

export const revealKeys = {
  week: (year: string, weekId: string) => ['revealWeek', year, weekId] as const,
  entries: (year: string, weekId: string) => ['revealEntries', year, weekId] as const,
  lastWinner: (year: string) => ['lastWinner', year] as const,
  scores: (year: string, weekId: string) => ['weekScores', year, weekId] as const,
};

/**
 * One week by ID. Null if it doesn't exist or is still a draft (players can't read drafts).
 * `signedIn` must be true before this runs: the rules refuse every read until the guest sign-in has
 * finished, and that refusal looks the same as a week that isn't there.
 */
export function useRevealWeek(year: string, weekId: string, signedIn: boolean) {
  return useQuery({
    queryKey: revealKeys.week(year, weekId),
    enabled: signedIn,
    queryFn: async (): Promise<WeekView | null> => {
      try {
        const snap = await getDoc(
          doc(db, 'seasons', year, 'weeks', weekId).withConverter(weekConverter),
        );
        return snap.exists() ? snap.data() : null;
      } catch {
        return null; // a draft, or a week that isn't there: the rules answer both the same way
      }
    },
    // Results arrive through Sunday and Monday as the commissioner enters them.
    refetchInterval: (q) => (q.state.data?.status === 'locked' ? 60_000 : false),
  });
}

/** Every entry with its picks. Only call with `enabled` once the week is revealed. */
export function useRevealEntries(year: string, weekId: string, enabled: boolean) {
  return useQuery({
    queryKey: revealKeys.entries(year, weekId),
    enabled,
    staleTime: 5 * 60_000, // picks don't change after the lock, bar a rare approved late entry
    queryFn: async (): Promise<RevealEntry[]> => {
      const entries = await getDocs(collection(db, 'seasons', year, 'weeks', weekId, 'entries'));
      return Promise.all(
        entries.docs.map(async (snap) => {
          const entry = snap.data() as Entry;
          const picksSnap = await getDoc(doc(snap.ref, 'private', 'picks'));
          const picks = picksSnap.exists() ? (picksSnap.data() as EntryPicks) : null;
          return {
            playerId: snap.id,
            displayName: entry.displayName,
            picks: picks?.picks ?? {},
            tiebreakerTotal:
              typeof picks?.tiebreakerTotal === 'number' ? picks.tiebreakerTotal : null,
            submittedAtMs: entry.picksSubmittedAt?.toDate().getTime() ?? 0,
            late: Boolean(entry.lateOverride),
          };
        }),
      );
    },
  });
}

/** The most recent week with a published winner, for the home screen. Waits for the sign-in too. */
export function useLastWinner(year: string, signedIn: boolean) {
  return useQuery({
    queryKey: revealKeys.lastWinner(year),
    enabled: signedIn,
    queryFn: async (): Promise<WeekView | null> => {
      const snap = await getDocs(
        query(
          collection(db, 'seasons', year, 'weeks').withConverter(weekConverter),
          where('status', '==', 'final'),
          orderBy('weekNumber', 'desc'),
          limit(1),
        ),
      );
      return snap.empty ? null : snap.docs[0].data();
    },
  });
}

/**
 * ESPN's scores for a locked week (D-098), fetched each time the page opens, on Refresh scores, and
 * every minute while a game is being played (D-104).
 * They fill in games the commissioner hasn't saved yet, marked unofficial. Only while the week is
 * locked: once it is final, every result is the commissioner's.
 */
export function useWeekScores(year: string, week: WeekView | null | undefined) {
  const enabled = Boolean(week?.revealed && week.status === 'locked');
  return useQuery({
    queryKey: revealKeys.scores(year, week?.id ?? ''),
    enabled,
    queryFn: (): Promise<FeedScore[]> => fetchWeekScores(week!.games),
    refetchOnMount: 'always',
    retry: 1,
    // While a game is being played, look again every minute (D-104); otherwise only on Refresh.
    refetchInterval: (q) => (q.state.data?.some((s) => s.state === 'in') ? 60_000 : false),
  });
}
