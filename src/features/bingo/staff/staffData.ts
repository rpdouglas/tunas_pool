/**
 * Data for the bingo staff screens (BINGO_PLAN S15). Staff read every bingo document but the code
 * (rules rows 72 to 78); every change is a callable that checks the role again and writes the
 * audit log (D-114). The counter sees the same screens with fewer buttons.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { addDays } from '@shared/time';
import type { BingoDrawStatus } from '@shared/bingo';
import { paymentRows, type PaymentRowData, type StaffPayment } from '@shared/bingoStaffView';
import { db, functions } from '../../../lib/firebase';
import type { CycleView } from '../bingoData';

export interface StaffDraw {
  date: string;
  status: BingoDrawStatus;
  numbers: number[] | null;
  cutoffAtMs: number;
  paidCards: number;
  potAddCents: number;
  corrected: boolean;
}

export interface StaffMember {
  playerId: string;
  displayName: string;
  paper: boolean;
  activeCards: number;
  limit: number;
  paused: boolean;
}

export interface StaffConfig {
  enabled: boolean;
  priceCents: number;
  operatorPct: number;
  cutoff: { weekday: number; time: string; tz: string };
  maxCardsPerPlayer: number;
  maxWeeks: number;
  joinWindowDraws: number;
}

export interface StaffBingo {
  config: StaffConfig | null;
  open: CycleView | null;
  draws: StaffDraw[];
  dueDraw: string | null;
  rows: PaymentRowData[];
  members: StaffMember[];
  /** Finished games with a winner not yet marked paid, newest first. */
  unpaid: CycleView[];
  /** The last finished game, while a correction is still allowed (no payout marked). */
  correctable: { cycle: CycleView; draws: StaffDraw[] } | null;
}

export const staffKeys = { all: ['bingoStaff'] as const };

const toCycle = (id: string, d: Record<string, unknown>): CycleView => ({
  id,
  number: d.number as number,
  status: d.status as CycleView['status'],
  test: d.test === true,
  firstDraw: d.firstDraw as string,
  config: d.config as CycleView['config'],
  potCents: (d.potCents as number) ?? 0,
  drawsApproved: (d.drawsApproved as number) ?? 0,
  board: (d.board as CycleView['board']) ?? { at3: 0, at4: 0, at5: 0, cards: 0 },
  closingDraw: (d.closingDraw as string | null) ?? null,
  carriedOutCents: (d.carriedOutCents as number) ?? 0,
  winners: (d.winners as CycleView['winners']) ?? [],
});

async function readDraws(cycleId: string): Promise<StaffDraw[]> {
  const snap = await getDocs(collection(db, `bingoCycles/${cycleId}/draws`));
  return snap.docs
    .map((d) => ({
      date: d.id,
      status: d.get('status') as BingoDrawStatus,
      numbers: (d.get('numbers') as number[] | null) ?? null,
      cutoffAtMs: d.get('cutoffAt')?.toMillis?.() ?? 0,
      paidCards: (d.get('paidCards') as number) ?? 0,
      potAddCents: (d.get('potAddCents') as number) ?? 0,
      corrected: Boolean(d.get('correction')),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function readPayments(cycleId: string, drawDate: string): Promise<Map<string, StaffPayment>> {
  const snap = await getDocs(collection(db, `bingoCycles/${cycleId}/draws/${drawDate}/payments`));
  return new Map(
    snap.docs.map((d) => [
      d.id,
      {
        paid: d.get('paid') === true,
        method: (d.get('method') as StaffPayment['method']) ?? null,
        late: d.get('late') === true,
        intent: (d.get('intent') as StaffPayment['intent']) ?? null,
      },
    ]),
  );
}

export async function loadStaffBingo(): Promise<StaffBingo> {
  const [configSnap, cycleSnap, cardSnap, memberSnap] = await Promise.all([
    getDoc(doc(db, 'bingo/config')),
    getDocs(query(collection(db, 'bingoCycles'), orderBy('number', 'desc'), limit(6))),
    getDocs(query(collection(db, 'bingoCards'), where('active', '==', true))),
    getDocs(collection(db, 'bingoMembers')),
  ]);
  const cycles = cycleSnap.docs.map((d) => toCycle(d.id, d.data()));
  const open = cycles.find((c) => c.status === 'open') ?? null;
  const closed = cycles.filter((c) => c.status !== 'open');
  const activeCount = new Map<string, number>();
  for (const c of cardSnap.docs)
    activeCount.set(c.get('playerId'), (activeCount.get(c.get('playerId')) ?? 0) + 1);

  const members = memberSnap.docs
    .map((d) => {
      const paused = d.get('pausedThroughCycle') as number | null;
      return {
        playerId: d.id,
        displayName: (d.get('displayName') as string) ?? '',
        paper: d.get('paper') === true,
        activeCards: activeCount.get(d.id) ?? 0,
        limit: (d.get('limit') as number) ?? 5,
        paused: paused !== null && open !== null && open.number <= paused,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  let draws: StaffDraw[] = [];
  let dueDraw: string | null = null;
  let rows: PaymentRowData[] = [];
  if (open) {
    draws = await readDraws(open.id);
    const closedDates = new Set(
      draws.filter((d) => d.status === 'approved' || d.status === 'skipped').map((d) => d.date),
    );
    dueDraw = open.firstDraw;
    while (closedDates.has(dueDraw)) dueDraw = addDays(dueDraw, 7);
    const [entries, due, next] = await Promise.all([
      getDocs(collection(db, `bingoCycles/${open.id}/entries`)),
      readPayments(open.id, dueDraw),
      readPayments(open.id, addDays(dueDraw, 7)),
    ]);
    const inGame = new Set(entries.docs.map((d) => d.id));
    rows = paymentRows({
      cards: cardSnap.docs
        .filter((d) => inGame.has(d.id))
        .map((d) => ({ cardId: d.id, playerId: d.get('playerId'), numbers: d.get('numbers') })),
      members: new Map(
        members.map((m) => [m.playerId, { displayName: m.displayName, paper: m.paper }]),
      ),
      due,
      next,
    });
  }

  const last = closed[0];
  const correctable =
    last && last.winners.every((w) => !w.paidOut)
      ? { cycle: last, draws: (await readDraws(last.id)).filter((d) => d.status === 'approved') }
      : null;

  return {
    config: configSnap.exists() ? (configSnap.data() as StaffConfig) : null,
    open,
    draws,
    dueDraw,
    rows,
    members,
    unpaid: closed.filter((c) => c.winners.some((w) => !w.paidOut)),
    correctable,
  };
}

export function useStaffBingo() {
  return useQuery({ queryKey: staffKeys.all, queryFn: () => loadStaffBingo() });
}

/** Whether a draw is waiting for approval, for the Back Office banner (R-22). */
export function useDrawWaiting(enabled: boolean) {
  return useQuery({
    queryKey: ['bingoStaff', 'waiting'],
    enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const open = await getDocs(
        query(collection(db, 'bingoCycles'), where('status', '==', 'open'), limit(1)),
      );
      if (open.empty) return null;
      const proposed = await getDocs(
        query(
          collection(db, `bingoCycles/${open.docs[0].id}/draws`),
          where('status', '==', 'proposed'),
          limit(1),
        ),
      );
      return proposed.empty ? null : { drawDate: proposed.docs[0].id };
    },
  });
}

function useStaffCall<I, O = unknown>(name: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: I) => (await httpsCallable<I, O>(functions, name)(input)).data,
    onSuccess: () => client.invalidateQueries({ queryKey: staffKeys.all }),
  });
}

export type ApproveOutcome = {
  kind: 'open' | 'won' | 'capped' | 'carried';
  winners?: { displayName: string; shareCents: number }[];
};

export const useEnterDraw = () => useStaffCall<{ numbers: number[] }>('bingoEnterDraw');
export const useApproveDraw = () =>
  useStaffCall<{ drawDate: string }, ApproveOutcome>('bingoApproveDraw');
export const useCorrectDraw = () =>
  useStaffCall<
    { cycleId: string; drawDate: string; numbers: number[]; reason: string },
    ApproveOutcome & { reopened: boolean }
  >('bingoCorrectDraw');
export const useSkipDraw = () =>
  useStaffCall<{ drawDate: string; reason: string }, { moved: number }>('bingoSkipDraw');
export const useSetBingoPayment = () =>
  useStaffCall<{
    cardId: string;
    paid: boolean;
    method?: 'cash' | 'etransfer';
    receivedAtMs?: number;
    drawDate?: string;
    reason?: string;
  }>('bingoSetPayment');
export const useSetPayout = () =>
  useStaffCall<{ cycleId: string; cardId: string; paid: boolean; method?: 'cash' | 'etransfer' }>(
    'bingoSetPayout',
  );
export const useSetConfig = () => useStaffCall<{ config: StaffConfig }>('bingoSetConfig');
export const useSetCode = () => useStaffCall<{ code: string }>('bingoSetCode');
export const useStartCycle = () => useStaffCall<{ test: boolean }>('bingoStartCycle');
export const useAddMember = () =>
  useStaffCall<{ playerId: string; ageConfirmed: boolean }>('bingoAddMember');
export const useStaffCreateCard = () =>
  useStaffCall<{ playerId: string; numbers: number[] | null }>('bingoCreateCard');

export function useBingoRoster(enabled: boolean) {
  return useQuery({
    queryKey: ['bingoStaff', 'roster'],
    enabled,
    queryFn: async () =>
      (
        await httpsCallable<void, { playerId: string; displayName: string }[]>(
          functions,
          'bingoRoster',
        )()
      ).data,
  });
}

export function useBingoTotals(enabled: boolean) {
  return useQuery({
    queryKey: ['bingoStaff', 'totals'],
    enabled,
    queryFn: async () =>
      (
        await httpsCallable<
          void,
          {
            cycleId: string | null;
            test: boolean;
            draws: {
              drawDate: string;
              paidCards: number;
              players: number;
              heavyShare: number;
              atCap: number;
            }[];
          }
        >(functions, 'bingoTotals')()
      ).data,
  });
}
