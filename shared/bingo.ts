/**
 * Tunas 649 Bingo, the rules of the game (DATA_MODEL §11, D-110 to D-129). All pure: the
 * functions call these every time a draw is approved or corrected, and the simulation
 * (scripts/bingo-sim.ts) runs on the same code. Nothing here is ever added to: a card's crossed-off
 * numbers, the pot, and the winners are worked out again from the approved draws and the paid
 * draws (D-113). Money is integer cents.
 */
import { addDays, toZonedParts, zonedTimeToUtc } from './time';

export const BINGO_LOW = 1;
export const BINGO_HIGH = 49;
export const BINGO_PICKS = 6;

export interface BingoCutoff {
  /** 0 = Sunday … 6 = Saturday. Wednesday is 3 (D-122). */
  weekday: number;
  /** 'HH:MM' on the wall clock in `tz`. */
  time: string;
  tz: string;
}

/** The settings a cycle copies from `bingo/config` when it opens. */
export interface BingoCycleConfig {
  priceCents: number;
  operatorPct: number;
  cutoff: BingoCutoff;
  maxCardsPerPlayer: number;
  maxWeeks: number;
  joinWindowDraws: number;
}

export const DEFAULT_CUTOFF: BingoCutoff = { weekday: 3, time: '18:00', tz: 'America/Toronto' };

export type BingoDrawStatus = 'upcoming' | 'proposed' | 'approved' | 'skipped';

// ---------- cards ----------

export type CardCheck = { ok: true; numbers: number[] } | { ok: false; message: string };

/** Six different whole numbers from 1 to 49, returned sorted. Used for cards and for draws. */
export function checkNumbers(input: readonly unknown[]): CardCheck {
  if (input.length !== BINGO_PICKS) {
    return { ok: false, message: `Pick exactly ${BINGO_PICKS} numbers.` };
  }
  if (
    !input.every(
      (n) => Number.isInteger(n) && (n as number) >= BINGO_LOW && (n as number) <= BINGO_HIGH,
    )
  ) {
    return {
      ok: false,
      message: `Each number must be a whole number from ${BINGO_LOW} to ${BINGO_HIGH}.`,
    };
  }
  const numbers = [...(input as number[])].sort((a, b) => a - b);
  if (numbers.some((n, i) => i > 0 && n === numbers[i - 1])) {
    return { ok: false, message: 'Each number can only be picked once.' };
  }
  return { ok: true, numbers };
}

/** Six different numbers, chosen with `random` (returns [0, 1), like Math.random). */
export function quickPick(random: () => number): number[] {
  const pool = Array.from({ length: BINGO_HIGH - BINGO_LOW + 1 }, (_, i) => i + BINGO_LOW);
  for (let i = 0; i < BINGO_PICKS; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, BINGO_PICKS).sort((a, b) => a - b);
}

// ---------- time: draws and the cutoff ----------

/** When the cutoff falls for the draw on `drawDate` (a 'YYYY-MM-DD' on the cutoff's weekday). */
export function cutoffAt(drawDate: string, cutoff: BingoCutoff = DEFAULT_CUTOFF): Date {
  const [h, m] = cutoff.time.split(':').map(Number);
  return zonedTimeToUtc(drawDate, h, m, cutoff.tz);
}

/** The first draw whose cutoff is after `instant`. */
export function drawFor(instant: Date, cutoff: BingoCutoff = DEFAULT_CUTOFF): string {
  const { isoDate, weekday } = toZonedParts(instant, cutoff.tz);
  let date = addDays(isoDate, (cutoff.weekday - weekday + 7) % 7);
  if (cutoffAt(date, cutoff).getTime() <= instant.getTime()) date = addDays(date, 7);
  return date;
}

export interface PaymentCreditInput {
  /** When the money was handed over or arrived (D-119). */
  receivedAt: Date;
  /** When staff are recording it. */
  now: Date;
  cutoff: BingoCutoff;
  /** The draw the money was meant for: the cycle's earliest draw not yet approved or skipped. */
  dueDraw: string;
  approvedDraws: ReadonlySet<string>;
  skippedDraws: ReadonlySet<string>;
}

export type PaymentCredit =
  | { ok: true; drawDate: string; late: boolean; needsReason: boolean }
  | { ok: false; message: string };

/** How far back `receivedAt` may sit before it counts as set by hand and needs a reason. */
export const BACKDATE_GRACE_MS = 5 * 60 * 1000;

/**
 * Which draw money counts for (D-119): the first draw whose cutoff it beat, moving past a skipped
 * draw (D-129). Money can't be put on a draw that is already approved, and since `receivedAt` is
 * never in the future it can't be put on a draw ahead of this week's either (no paying ahead,
 * D-116).
 */
export function creditPayment(input: PaymentCreditInput): PaymentCredit {
  const { receivedAt, now, cutoff, dueDraw, approvedDraws, skippedDraws } = input;
  if (receivedAt.getTime() > now.getTime()) {
    return { ok: false, message: 'Money can’t be received in the future.' };
  }
  let drawDate = drawFor(receivedAt, cutoff);
  while (skippedDraws.has(drawDate)) drawDate = addDays(drawDate, 7);
  if (approvedDraws.has(drawDate)) {
    return {
      ok: false,
      message: `The ${drawDate} draw is already approved. Record the money as received now and it counts for the next draw.`,
    };
  }
  if (drawDate < dueDraw) {
    return { ok: false, message: 'That is before this game’s first draw.' };
  }
  const late = drawDate > dueDraw;
  const backdated = now.getTime() - receivedAt.getTime() > BACKDATE_GRACE_MS;
  return { ok: true, drawDate, late, needsReason: late || backdated };
}

/** Whether a new card can join the cycle now (D-117). */
export function joinWindowOpen(input: {
  now: Date;
  /** The cutoff of the last draw a new card may join at (the first, with `joinWindowDraws: 1`). */
  windowCutoffAt: Date;
  approvedDraws: number;
  joinWindowDraws: number;
}): boolean {
  return (
    input.approvedDraws < input.joinWindowDraws &&
    input.now.getTime() < input.windowCutoffAt.getTime()
  );
}

export const JOIN_CLOSED_MESSAGE = 'Cards for the next game open after this one is won.';

// ---------- limits (D-118) ----------

export interface MemberLimits {
  limit: number;
  pendingLimit: number | null;
  pendingFromCycle: number | null;
  pausedThroughCycle: number | null;
}

/** Cards a member may have paid for one draw in cycle number `cycle`. */
export function cardsAllowed(m: MemberLimits, cycle: number, maxCards: number): number {
  if (m.pausedThroughCycle !== null && cycle <= m.pausedThroughCycle) return 0;
  const limit =
    m.pendingLimit !== null && m.pendingFromCycle !== null && cycle >= m.pendingFromCycle
      ? m.pendingLimit
      : m.limit;
  return Math.max(0, Math.min(limit, maxCards));
}

/** The member's own change of limit: lower now, raise from the next cycle. */
export function changeLimit(
  m: MemberLimits,
  requested: number,
  cycle: number,
  maxCards: number,
): MemberLimits | { error: string } {
  if (!Number.isInteger(requested) || requested < 1 || requested > maxCards) {
    return { error: `Choose from 1 to ${maxCards} cards.` };
  }
  const current = cardsAllowed({ ...m, pausedThroughCycle: null }, cycle, maxCards);
  if (requested <= current) {
    return { ...m, limit: requested, pendingLimit: null, pendingFromCycle: null };
  }
  return { ...m, limit: current, pendingLimit: requested, pendingFromCycle: cycle + 1 };
}

/**
 * Pause this cycle and the next `cycles - 1` (0 ends a pause). A longer pause applies now; ending
 * one early still sits out the rest of this cycle, since loosening waits (D-118).
 */
export function pause(
  m: MemberLimits,
  cycles: number,
  cycle: number,
): MemberLimits | { error: string } {
  if (!Number.isInteger(cycles) || cycles < 0 || cycles > 52) {
    return { error: 'Choose how many games to sit out.' };
  }
  const wanted = cycles === 0 ? null : cycle + cycles - 1;
  const pausedNow = m.pausedThroughCycle !== null && m.pausedThroughCycle >= cycle;
  return { ...m, pausedThroughCycle: pausedNow ? (wanted ?? cycle) : wanted };
}

// ---------- money ----------

export interface DrawMoney {
  paidCards: number;
  revenueCents: number;
  operatorCents: number;
  potAddCents: number;
}

/** One draw's money, rounded once (D-120): the operator share rounds down, the pot gets the rest. */
export function drawMoney(paidCards: number, priceCents: number, operatorPct: number): DrawMoney {
  const revenueCents = paidCards * priceCents;
  const operatorCents = Math.floor((revenueCents * operatorPct) / 100);
  return { paidCards, revenueCents, operatorCents, potAddCents: revenueCents - operatorCents };
}

export interface Share {
  cardId: string;
  shareCents: number;
}

/** Split a pot among winning cards: equal shares, leftover cents one each in card-ID order (D-120). */
export function splitPot(potCents: number, cardIds: readonly string[]): Share[] {
  if (cardIds.length === 0) return [];
  const ordered = [...cardIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const share = Math.floor(potCents / ordered.length);
  const remainder = potCents - share * ordered.length;
  return ordered.map((cardId, i) => ({ cardId, shareCents: share + (i < remainder ? 1 : 0) }));
}

// ---------- a cycle, worked out ----------

export interface CycleDraw {
  date: string;
  status: BingoDrawStatus;
  numbers: readonly number[] | null;
}

export interface CycleEntry {
  cardId: string;
  playerId: string;
  numbers: readonly number[];
  paidDraws: readonly string[];
}

export type CycleOutcome =
  | { kind: 'open' }
  | { kind: 'won'; closingDraw: string; winners: Share[] }
  /** 26 weeks with no full card: the best cards paid for the last draw split it (D-121). */
  | { kind: 'capped'; closingDraw: string; winners: Share[] }
  /** Capped, but nobody paid for the last draw: the pot carries into the next cycle (D-121). */
  | { kind: 'carried'; closingDraw: string; carriedCents: number };

export interface CycleResult {
  entries: { cardId: string; playerId: string; hits: number[]; count: number }[];
  draws: (DrawMoney & { date: string })[];
  potCents: number;
  operatorCents: number;
  /** Approved draws counted, up to the one that closed the cycle. */
  drawsApproved: number;
  board: { at3: number; at4: number; at5: number; cards: number };
  outcome: CycleOutcome;
  /** Approved draws after the cycle closed. The functions refuse to make these. */
  afterClose: string[];
}

/**
 * Work out a whole cycle from its draws and entries (DATA_MODEL §11.4). Draws are taken in date
 * order; skipped, upcoming, and proposed draws change nothing. `carriedInCents` is a pot carried
 * from a cycle that capped with nobody paid.
 */
export function evaluateCycle(input: {
  config: Pick<BingoCycleConfig, 'priceCents' | 'operatorPct' | 'maxWeeks'>;
  draws: readonly CycleDraw[];
  entries: readonly CycleEntry[];
  carriedInCents?: number;
}): CycleResult {
  const { config, entries } = input;
  const draws = [...input.draws].sort((a, b) => (a.date < b.date ? -1 : 1));
  const paid = entries.map((e) => new Set(e.paidDraws));
  const numbers = entries.map((e) => new Set(e.numbers));
  const hits = entries.map(() => new Set<number>());
  const money: CycleResult['draws'] = [];
  let potCents = input.carriedInCents ?? 0;
  let operatorCents = 0;
  let approved = 0;
  let outcome: CycleOutcome = { kind: 'open' };
  const afterClose: string[] = [];

  for (const draw of draws) {
    if (draw.status !== 'approved') continue;
    if (outcome.kind !== 'open') {
      afterClose.push(draw.date);
      continue;
    }
    const check = checkNumbers(draw.numbers ?? []);
    if (!check.ok) throw new Error(`Draw ${draw.date}: ${check.message}`);
    approved++;
    const paidIdx = entries.map((_, i) => i).filter((i) => paid[i].has(draw.date));
    for (const i of paidIdx) {
      for (const n of check.numbers) if (numbers[i].has(n)) hits[i].add(n);
    }
    const m = drawMoney(paidIdx.length, config.priceCents, config.operatorPct);
    money.push({ date: draw.date, ...m });
    potCents += m.potAddCents;
    operatorCents += m.operatorCents;

    const full = paidIdx.filter((i) => hits[i].size === BINGO_PICKS);
    if (full.length > 0) {
      outcome = {
        kind: 'won',
        closingDraw: draw.date,
        winners: splitPot(
          potCents,
          full.map((i) => entries[i].cardId),
        ),
      };
    } else if (approved >= config.maxWeeks) {
      const best = Math.max(0, ...paidIdx.map((i) => hits[i].size));
      const top = paidIdx.filter((i) => hits[i].size === best);
      outcome =
        top.length > 0
          ? {
              kind: 'capped',
              closingDraw: draw.date,
              winners: splitPot(
                potCents,
                top.map((i) => entries[i].cardId),
              ),
            }
          : { kind: 'carried', closingDraw: draw.date, carriedCents: potCents };
    }
  }

  const out = entries.map((e, i) => {
    const h = [...hits[i]].sort((a, b) => a - b);
    return { cardId: e.cardId, playerId: e.playerId, hits: h, count: h.length };
  });
  return {
    entries: out,
    draws: money,
    potCents,
    operatorCents,
    drawsApproved: approved,
    board: {
      at3: out.filter((e) => e.count === 3).length,
      at4: out.filter((e) => e.count === 4).length,
      at5: out.filter((e) => e.count === 5).length,
      cards: out.length,
    },
    outcome,
    afterClose,
  };
}
