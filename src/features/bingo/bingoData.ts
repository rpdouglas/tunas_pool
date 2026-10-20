/**
 * Data for the bingo screens (DATA_MODEL §11). Reads go through the rules (rows 67 to 80): a member
 * reads their own membership, cards, entries, and payments, the cycles, and approved or skipped
 * draws. Every change is a callable (D-129). `bingoStatus` comes first: it says whether to show
 * bingo at all (D-132) and refreshes the `logins` pointer the rules read.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';
import { cutoffAt, joinWindowOpen, type BingoCycleConfig, type MemberLimits } from '@shared/bingo';
import { addDays, toZonedParts } from '@shared/time';
import type { PaymentView } from '@shared/bingoView';
import { db, functions } from '../../lib/firebase';

export interface BingoStatus {
  visible: boolean;
  enabled: boolean;
  member: boolean;
  staff: boolean;
  playerId: string | null;
  rules: { priceCents: number; operatorPct: number; maxWeeks: number } | null;
}

export const bingoKeys = {
  all: ['bingo'] as const,
  status: (uid: string) => ['bingo', 'status', uid] as const,
  mine: (playerId: string) => ['bingo', 'mine', playerId] as const,
  cycle: ['bingo', 'cycle'] as const,
  history: ['bingo', 'history'] as const,
};

export function useBingoStatus(uid: string | undefined) {
  return useQuery({
    queryKey: bingoKeys.status(uid ?? ''),
    enabled: Boolean(uid),
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => (await httpsCallable<void, BingoStatus>(functions, 'bingoStatus')()).data,
  });
}

export interface CycleView {
  id: string;
  number: number;
  status: 'open' | 'won' | 'capped';
  test: boolean;
  firstDraw: string;
  config: BingoCycleConfig;
  potCents: number;
  drawsApproved: number;
  board: { at3: number; at4: number; at5: number; cards: number };
  closingDraw: string | null;
  carriedOutCents: number;
  winners: {
    cardId: string;
    playerId: string;
    displayName: string;
    hits: number;
    shareCents: number;
  }[];
}

const toCycle = (id: string, d: Record<string, unknown>): CycleView => ({
  id,
  number: d.number as number,
  status: d.status as CycleView['status'],
  test: d.test === true,
  firstDraw: d.firstDraw as string,
  config: d.config as BingoCycleConfig,
  potCents: (d.potCents as number) ?? 0,
  drawsApproved: (d.drawsApproved as number) ?? 0,
  board: (d.board as CycleView['board']) ?? { at3: 0, at4: 0, at5: 0, cards: 0 },
  closingDraw: (d.closingDraw as string | null) ?? null,
  carriedOutCents: (d.carriedOutCents as number) ?? 0,
  winners: (d.winners as CycleView['winners']) ?? [],
});

/** The open game, or null between games. */
export function useOpenCycle(enabled: boolean) {
  return useQuery({
    queryKey: bingoKeys.cycle,
    enabled,
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'bingoCycles'), where('status', '==', 'open'), limit(1)),
      );
      return snap.empty ? null : toCycle(snap.docs[0].id, snap.docs[0].data());
    },
  });
}

/** Finished games, newest first. */
export function useBingoHistory(enabled: boolean) {
  return useQuery({
    queryKey: bingoKeys.history,
    enabled,
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'bingoCycles'), orderBy('number', 'desc'), limit(30)),
      );
      return snap.docs.map((d) => toCycle(d.id, d.data())).filter((c) => c.status !== 'open');
    },
  });
}

export interface MyCard {
  cardId: string;
  numbers: number[];
  hits: number[];
  paidDraws: number;
  payment: PaymentView | null;
}

export interface MyBingo {
  limits: MemberLimits;
  spent: { cycleCents: number; yearCents: number; year: string };
  cycle: CycleView | null;
  cards: MyCard[];
  /** The draw money is due for now. */
  dueDraw: string | null;
  drawsSoFar: number;
  joinOpen: boolean;
}

/** The first draw from `firstDraw` that isn't approved or skipped. */
function dueFrom(firstDraw: string, closed: Set<string>): string {
  let d = firstDraw;
  while (closed.has(d)) d = addDays(d, 7);
  return d;
}

export async function loadMyBingo(playerId: string, now = new Date()): Promise<MyBingo> {
  const [member, cycleSnap, cardSnap] = await Promise.all([
    getDoc(doc(db, `bingoMembers/${playerId}`)),
    getDocs(query(collection(db, 'bingoCycles'), where('status', '==', 'open'), limit(1))),
    getDocs(query(collection(db, 'bingoCards'), where('playerId', '==', playerId))),
  ]);
  const m = member.data() ?? {};
  const cycle = cycleSnap.empty ? null : toCycle(cycleSnap.docs[0].id, cycleSnap.docs[0].data());
  const year = toZonedParts(now).isoDate.slice(0, 4);
  const spent = {
    cycleCents: cycle ? ((m.spent?.byCycle?.[cycle.id] as number) ?? 0) : 0,
    yearCents: (m.spent?.byYear?.[year] as number) ?? 0,
    year,
  };
  const limits: MemberLimits = {
    limit: (m.limit as number) ?? 5,
    pendingLimit: (m.pendingLimit as number | null) ?? null,
    pendingFromCycle: (m.pendingFromCycle as number | null) ?? null,
    pausedThroughCycle: (m.pausedThroughCycle as number | null) ?? null,
  };
  const active = cardSnap.docs.filter((d) => d.get('active') === true);
  if (!cycle) {
    return {
      limits,
      spent,
      cycle: null,
      cards: active.map((d) => ({
        cardId: d.id,
        numbers: d.get('numbers'),
        hits: [],
        paidDraws: 0,
        payment: null,
      })),
      dueDraw: null,
      drawsSoFar: 0,
      joinOpen: false,
    };
  }
  const base = `bingoCycles/${cycle.id}`;
  const [entrySnap, drawSnap] = await Promise.all([
    getDocs(query(collection(db, `${base}/entries`), where('playerId', '==', playerId))),
    getDocs(query(collection(db, `${base}/draws`), where('status', 'in', ['approved', 'skipped']))),
  ]);
  const closed = new Set(drawSnap.docs.map((d) => d.id));
  const dueDraw = dueFrom(cycle.firstDraw, closed);
  const entries = new Map(entrySnap.docs.map((d) => [d.id, d.data()]));
  const payments = await Promise.all(
    active.map((d) =>
      getDoc(doc(db, `${base}/draws/${dueDraw}/payments/${d.id}`)).catch(() => null),
    ),
  );
  return {
    limits,
    spent,
    cycle,
    dueDraw,
    drawsSoFar: cycle.drawsApproved,
    joinOpen: joinWindowOpen({
      now,
      windowCutoffAt: cutoffAt(cycle.firstDraw, cycle.config.cutoff),
      approvedDraws: cycle.drawsApproved,
      joinWindowDraws: cycle.config.joinWindowDraws,
    }),
    cards: active.map((d, i) => {
      const e = entries.get(d.id);
      const p = payments[i];
      return {
        cardId: d.id,
        numbers: d.get('numbers') as number[],
        hits: (e?.hits as number[]) ?? [],
        paidDraws: ((e?.paidDraws as string[]) ?? []).filter((x) => closed.has(x)).length,
        payment: p?.exists()
          ? {
              paid: p.get('paid') === true,
              late: p.get('late') === true,
              intent: p.get('intent') ?? null,
            }
          : null,
      };
    }),
  };
}

export function useMyBingo(playerId: string | null | undefined) {
  return useQuery({
    queryKey: bingoKeys.mine(playerId ?? ''),
    enabled: Boolean(playerId),
    queryFn: () => loadMyBingo(playerId!),
  });
}

/** A callable that refreshes the bingo screens after it runs. */
function useBingoCall<I, O = unknown>(name: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: I) => (await httpsCallable<I, O>(functions, name)(input)).data,
    onSuccess: () => client.invalidateQueries({ queryKey: bingoKeys.all }),
  });
}

export const useRedeemCode = () => useBingoCall<{ code: string }>('bingoRedeemCode');
export const useCreateCard = () =>
  useBingoCall<{ numbers: number[] | null }, { cardId: string; numbers: number[] }>(
    'bingoCreateCard',
  );
export const useSetIntent = () =>
  useBingoCall<{ cardId: string; intent: 'cash' | 'etransfer' }>('bingoSetIntent');
export const useSetLimit = () =>
  useBingoCall<{ limit?: number; pauseCycles?: number }>('bingoSetLimit');
export const useRetireCard = () => useBingoCall<{ cardId: string }>('bingoRetireCard');

/**
 * Before joining: a name and the 18+ confirmation on this login's profile (D-115). Creates the
 * self-serve profile the way the entry form does, or adds the confirmation to one that lacks it.
 */
export async function saveJoinProfile(input: {
  uid: string;
  existing: { id: string; hasAge: boolean } | null;
  displayName: string;
}): Promise<void> {
  if (!input.existing) {
    await setDoc(doc(db, 'players', input.uid), {
      displayName: input.displayName,
      phone: null,
      email: null,
      claimedByUid: input.uid,
      origin: 'self',
      usualPayment: null,
      ageAttestedAt: serverTimestamp(),
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else if (!input.existing.hasAge) {
    await updateDoc(doc(db, 'players', input.existing.id), {
      ageAttestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

/** The server's plain-words reason, for a player. */
export function bingoError(err: unknown): string {
  if (err instanceof FirebaseError) {
    if (err.code === 'functions/unavailable' || err.code === 'functions/deadline-exceeded') {
      return "Couldn't reach the pool. Check your signal and try again.";
    }
    return err.message || 'Something went wrong. Try again.';
  }
  return 'Something went wrong. Try again.';
}
