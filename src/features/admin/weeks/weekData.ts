/**
 * Typed Firestore access for weeks (CLAUDE.md §5: no raw getDoc in components).
 * Draft edits are direct client writes, which the rules allow for admins while a week is a draft.
 * Status changes go through the audited `adminSetWeekStatus` callable.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type FirestoreDataConverter,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { Game, Week, WeekStatus } from '@shared/types';
import { DEFAULT_ENTRY_FEE_CENTS, MNF_GAME_ID, type GameDraft } from '@shared/weeks';
import { db, functions } from '../../../lib/firebase';

/** A week as the admin screens use it: kickoffs and lock as epoch milliseconds. */
export interface WeekView {
  id: string;
  year: string;
  weekNumber: number;
  status: WeekStatus;
  lockAtMs: number;
  revealed: boolean;
  games: GameDraft[];
  mnfGameId: string;
  entryFeeCents: number;
  entryCount: number;
}

const weekConverter: FirestoreDataConverter<WeekView> = {
  toFirestore: () => {
    throw new Error('Write weeks with saveDraftWeek.');
  },
  fromFirestore(snapshot) {
    const w = snapshot.data() as Week;
    return {
      id: snapshot.id,
      year: snapshot.ref.parent.parent!.id,
      weekNumber: w.weekNumber,
      status: w.status,
      lockAtMs: w.lockAt.toDate().getTime(),
      revealed: w.revealed,
      games: (w.games ?? []).map((g: Game) => ({ ...g, kickoffMs: g.kickoff.toDate().getTime() })),
      mnfGameId: w.mnfGameId,
      entryFeeCents: w.entryFeeCents,
      entryCount: w.entryCount ?? 0,
    };
  },
};

const weeksCollection = (year: string) =>
  collection(db, 'seasons', year, 'weeks').withConverter(weekConverter);

export const weekKeys = {
  season: (year: string) => ['weeks', year] as const,
  one: (year: string, weekId: string) => ['weeks', year, weekId] as const,
};

export function useSeasonWeeks(year: string) {
  return useQuery({
    queryKey: weekKeys.season(year),
    queryFn: async () =>
      (await getDocs(query(weeksCollection(year), orderBy('weekNumber')))).docs.map((d) =>
        d.data(),
      ),
  });
}

export function useWeek(year: string, weekId: string | undefined) {
  return useQuery({
    queryKey: weekKeys.one(year, weekId ?? 'new'),
    enabled: Boolean(weekId),
    queryFn: async () => {
      const snap = await getDoc(doc(weeksCollection(year), weekId!));
      return snap.exists() ? snap.data() : null;
    },
  });
}

export interface DraftInput {
  year: string;
  weekId: string;
  weekNumber: number;
  games: GameDraft[];
  lockAtMs: number;
  entryFeeCents?: number;
  isNew: boolean;
}

function toGames(games: GameDraft[]): Game[] {
  return games.map(({ kickoffMs, ...g }) => ({ ...g, kickoff: Timestamp.fromMillis(kickoffMs) }));
}

export async function saveDraftWeek(input: DraftInput): Promise<void> {
  const ref = doc(db, 'seasons', input.year, 'weeks', input.weekId);
  const editable = {
    weekNumber: input.weekNumber,
    games: toGames(input.games),
    mnfGameId: MNF_GAME_ID,
    lockAt: Timestamp.fromMillis(input.lockAtMs),
    updatedAt: serverTimestamp(),
  };
  if (!input.isNew) {
    await updateDoc(ref, editable);
    return;
  }
  const seasonRef = doc(db, 'seasons', input.year);
  const entryFeeCents = input.entryFeeCents ?? DEFAULT_ENTRY_FEE_CENTS;
  if (!(await getDoc(seasonRef)).exists()) {
    await setDoc(seasonRef, {
      year: input.year,
      status: 'active',
      entryFeeCents,
      createdAt: serverTimestamp(),
    });
  }
  if ((await getDoc(ref)).exists()) {
    throw new Error(
      `Week ${input.weekNumber} already exists. Open it from the week list to edit it.`,
    );
  }
  await setDoc(ref, {
    ...editable,
    status: 'draft',
    revealed: false,
    results: {},
    mnfTotal: null,
    entryFeeCents,
    entryCount: 0,
    paidCount: 0,
    winner: null,
    payoutSent: false,
    createdAt: serverTimestamp(),
  });
}

export function useSaveDraftWeek() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: saveDraftWeek,
    onSuccess: (_, input) => client.invalidateQueries({ queryKey: weekKeys.season(input.year) }),
  });
}

export function useSetWeekStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { year: string; weekId: string; status: WeekStatus }) =>
      (await httpsCallable(functions, 'adminSetWeekStatus')(input)).data,
    onSuccess: (_, input) => client.invalidateQueries({ queryKey: weekKeys.season(input.year) }),
  });
}
