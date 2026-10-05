/**
 * Season standings for players (CLAUDE.md §5). Standings are function-written and readable by any
 * signed-in player: a name and a record, never a phone, an email, or a payment (CLAUDE.md §8).
 * Every query here waits for the sign-in, because the rules refuse reads until there is a login.
 */
import { useQuery } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { rankStandings, type AllTimeStats, type StandingRow } from '@shared/standings';
import type { Standing } from '@shared/types';
import { db } from '../../lib/firebase';
import { weekConverter, type WeekView } from '../../lib/weekModel';

const toRow = (playerId: string, s: Standing): StandingRow => ({
  playerId,
  displayName: s.displayName,
  weeksPlayed: s.weeksPlayed,
  wins: s.wins,
  losses: s.losses,
  weeklyTitles: s.weeklyTitles,
  weekRecords: s.weekRecords ?? {},
});

export function useStandings(year: string, signedIn: boolean) {
  return useQuery({
    queryKey: ['standings', year],
    enabled: signedIn,
    queryFn: async (): Promise<StandingRow[]> => {
      const snap = await getDocs(collection(db, 'seasons', year, 'standings'));
      return rankStandings(snap.docs.map((d) => toRow(d.id, d.data() as Standing)));
    },
  });
}

/** The top of the standings, for the home screen: one small read. */
export function useSeasonLeader(year: string, signedIn: boolean) {
  return useQuery({
    queryKey: ['seasonLeader', year],
    enabled: signedIn,
    queryFn: async (): Promise<StandingRow | null> => {
      const snap = await getDocs(
        query(collection(db, 'seasons', year, 'standings'), orderBy('wins', 'desc'), limit(1)),
      );
      return snap.empty ? null : toRow(snap.docs[0].id, snap.docs[0].data() as Standing);
    },
  });
}

export function usePlayerStanding(year: string, playerId: string, signedIn: boolean) {
  return useQuery({
    queryKey: ['standing', year, playerId],
    enabled: signedIn && Boolean(playerId),
    queryFn: async (): Promise<StandingRow | null> => {
      const snap = await getDoc(doc(db, 'seasons', year, 'standings', playerId));
      return snap.exists() ? toRow(snap.id, snap.data() as Standing) : null;
    },
  });
}

/** Every week players can see, newest first, for the week picker. */
export function useSeasonWeekList(year: string, signedIn: boolean) {
  return useQuery({
    queryKey: ['seasonWeekList', year],
    enabled: signedIn,
    queryFn: async (): Promise<WeekView[]> => {
      const snap = await getDocs(
        query(
          collection(db, 'seasons', year, 'weeks').withConverter(weekConverter),
          // Players can only list weeks filtered away from drafts (FIRESTORE_RULES row 36).
          where('status', 'in', ['open', 'locked', 'final']),
          orderBy('weekNumber', 'desc'),
        ),
      );
      return snap.docs.map((d) => d.data());
    },
  });
}

/** A player's own all-time stats. Only the owner and the admin can read them. */
export function useMyAllTime(playerId: string | undefined) {
  return useQuery({
    queryKey: ['myAllTime', playerId ?? ''],
    enabled: Boolean(playerId),
    queryFn: async (): Promise<AllTimeStats | null> => {
      const snap = await getDoc(doc(db, 'players', playerId!, 'stats', 'allTime'));
      return snap.exists() ? (snap.data() as AllTimeStats) : null;
    },
  });
}
