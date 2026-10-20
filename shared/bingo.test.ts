import { describe, expect, it } from 'vitest';
import {
  BACKDATE_GRACE_MS,
  DEFAULT_CUTOFF,
  JOIN_CLOSED_MESSAGE,
  cardsAllowed,
  changeLimit,
  checkNumbers,
  creditPayment,
  cutoffAt,
  drawFor,
  drawMoney,
  evaluateCycle,
  joinWindowOpen,
  pause,
  quickPick,
  splitPot,
  type CycleDraw,
  type CycleEntry,
  type MemberLimits,
} from './bingo';

// Stand-ins only (D-125).
const config = { priceCents: 1000, operatorPct: 40, maxWeeks: 26 };
const toronto = (iso: string) => new Date(iso); // ISO strings below carry their own offset
const approved = (date: string, numbers: number[]): CycleDraw => ({
  date,
  status: 'approved',
  numbers,
});

describe('checkNumbers', () => {
  it('accepts six different numbers from 1 to 49, sorted', () => {
    expect(checkNumbers([43, 3, 27, 11, 35, 19])).toEqual({
      ok: true,
      numbers: [3, 11, 19, 27, 35, 43],
    });
    expect(checkNumbers([1, 2, 3, 4, 5, 49]).ok).toBe(true);
  });

  it('says what is wrong in plain words', () => {
    expect(checkNumbers([1, 2, 3, 4, 5])).toEqual({
      ok: false,
      message: 'Pick exactly 6 numbers.',
    });
    expect(checkNumbers([0, 2, 3, 4, 5, 6]).ok).toBe(false);
    expect(checkNumbers([1, 2, 3, 4, 5, 50]).ok).toBe(false);
    expect(checkNumbers([1, 2, 3, 4, 5, 5.5]).ok).toBe(false);
    expect(checkNumbers([1, 2, 3, 4, '5', 6]).ok).toBe(false);
    expect(checkNumbers([1, 2, 3, 4, 5, 5])).toEqual({
      ok: false,
      message: 'Each number can only be picked once.',
    });
  });
});

describe('quickPick', () => {
  it('gives six different valid numbers from the injected random source', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 200; i++) expect(checkNumbers(quickPick(random)).ok).toBe(true);
  });

  it('is fully decided by the random source', () => {
    expect(quickPick(() => 0)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(quickPick(() => 0.999999)).toEqual([1, 2, 3, 4, 5, 49]);
  });
});

describe('the cutoff and which draw', () => {
  it('is Wednesday 6:00 PM in Toronto, through the change back from daylight time', () => {
    expect(cutoffAt('2026-10-28').toISOString()).toBe('2026-10-28T22:00:00.000Z'); // EDT
    expect(cutoffAt('2026-11-11').toISOString()).toBe('2026-11-11T23:00:00.000Z'); // EST
  });

  it('finds the draw whose cutoff is next', () => {
    expect(drawFor(toronto('2026-11-05T09:00:00-05:00'))).toBe('2026-11-11'); // Thursday
    expect(drawFor(toronto('2026-11-11T17:59:00-05:00'))).toBe('2026-11-11');
    expect(drawFor(toronto('2026-11-11T18:00:00-05:00'))).toBe('2026-11-18'); // at the cutoff is late
    expect(drawFor(toronto('2026-11-11T23:30:00-05:00'))).toBe('2026-11-18');
  });
});

describe('creditPayment (D-119): by when the money was received', () => {
  const base = {
    cutoff: DEFAULT_CUTOFF,
    dueDraw: '2026-11-11',
    approvedDraws: new Set(['2026-11-04']),
    skippedDraws: new Set<string>(),
  };

  it('§11.6: cash at 5:50 PM, recorded at 7:05 PM, counts that night with a reason', () => {
    expect(
      creditPayment({
        ...base,
        receivedAt: toronto('2026-11-11T17:50:00-05:00'),
        now: toronto('2026-11-11T19:05:00-05:00'),
      }),
    ).toEqual({ ok: true, drawDate: '2026-11-11', late: false, needsReason: true });
  });

  it('§11.6: an e-Transfer at 6:20 PM counts next week, late', () => {
    expect(
      creditPayment({
        ...base,
        receivedAt: toronto('2026-11-11T18:20:00-05:00'),
        now: toronto('2026-11-12T10:00:00-05:00'),
      }),
    ).toEqual({ ok: true, drawDate: '2026-11-18', late: true, needsReason: true });
  });

  it('needs no reason when recorded as it is handed over', () => {
    const at = toronto('2026-11-09T12:00:00-05:00');
    expect(
      creditPayment({ ...base, receivedAt: at, now: new Date(at.getTime() + BACKDATE_GRACE_MS) }),
    ).toEqual({
      ok: true,
      drawDate: '2026-11-11',
      late: false,
      needsReason: false,
    });
  });

  it('refuses money received in the future, or before an approved draw’s cutoff', () => {
    const now = toronto('2026-11-09T12:00:00-05:00');
    expect(creditPayment({ ...base, receivedAt: new Date(now.getTime() + 60_000), now }).ok).toBe(
      false,
    );
    const r = creditPayment({ ...base, receivedAt: toronto('2026-11-04T12:00:00-05:00'), now });
    expect(r).toMatchObject({ ok: false });
    expect(r.ok ? '' : r.message).toMatch(/already approved/);
  });

  it('moves money past a skipped draw (D-129)', () => {
    expect(
      creditPayment({
        ...base,
        skippedDraws: new Set(['2026-11-11']),
        dueDraw: '2026-11-18',
        receivedAt: toronto('2026-11-10T12:00:00-05:00'),
        now: toronto('2026-11-10T12:00:00-05:00'),
      }),
    ).toEqual({ ok: true, drawDate: '2026-11-18', late: false, needsReason: false });
  });
});

describe('joinWindowOpen (D-117)', () => {
  const windowCutoffAt = cutoffAt('2026-11-11');
  it('§11.6: open until week one’s cutoff, while no draw is approved', () => {
    expect(
      joinWindowOpen({
        now: toronto('2026-11-09T12:00:00-05:00'),
        windowCutoffAt,
        approvedDraws: 0,
        joinWindowDraws: 1,
      }),
    ).toBe(true);
    expect(
      joinWindowOpen({
        now: toronto('2026-11-11T18:00:00-05:00'),
        windowCutoffAt,
        approvedDraws: 0,
        joinWindowDraws: 1,
      }),
    ).toBe(false);
    expect(
      joinWindowOpen({
        now: toronto('2026-11-09T12:00:00-05:00'),
        windowCutoffAt,
        approvedDraws: 1,
        joinWindowDraws: 1,
      }),
    ).toBe(false);
    expect(JOIN_CLOSED_MESSAGE).toBe('Cards for the next game open after this one is won.');
  });
});

describe('limits (D-118)', () => {
  const m: MemberLimits = {
    limit: 5,
    pendingLimit: null,
    pendingFromCycle: null,
    pausedThroughCycle: null,
  };

  it('lowers at once and raises from the next cycle', () => {
    const lower = changeLimit(m, 2, 4, 5) as MemberLimits;
    expect(cardsAllowed(lower, 4, 5)).toBe(2);
    const raise = changeLimit(lower, 4, 4, 5) as MemberLimits;
    expect(cardsAllowed(raise, 4, 5)).toBe(2);
    expect(cardsAllowed(raise, 5, 5)).toBe(4);
    // Lowering again cancels a raise that was waiting.
    expect(cardsAllowed(changeLimit(raise, 1, 4, 5) as MemberLimits, 5, 5)).toBe(1);
  });

  it('never goes over the cap, and refuses nonsense', () => {
    expect(cardsAllowed({ ...m, limit: 5 }, 1, 3)).toBe(3);
    expect(changeLimit(m, 0, 1, 5)).toHaveProperty('error');
    expect(changeLimit(m, 6, 1, 5)).toHaveProperty('error');
  });

  it('pauses now; ending a pause early still sits out this cycle', () => {
    const paused = pause(m, 2, 4) as MemberLimits;
    expect([4, 5, 6].map((c) => cardsAllowed(paused, c, 5))).toEqual([0, 0, 5]);
    const ended = pause(paused, 0, 4) as MemberLimits;
    expect([4, 5].map((c) => cardsAllowed(ended, c, 5))).toEqual([0, 5]);
    const longer = pause(paused, 3, 4) as MemberLimits;
    expect(cardsAllowed(longer, 6, 5)).toBe(0);
    expect(pause(m, 0, 4)).toEqual(m);
  });
});

describe('money', () => {
  it('§11.6: 98 cards paid, 40% operator', () => {
    expect(drawMoney(98, 1000, 40)).toEqual({
      paidCards: 98,
      revenueCents: 98_000,
      operatorCents: 39_200,
      potAddCents: 58_800,
    });
  });

  it('rounds the operator share down and gives the cent to the pot', () => {
    expect(drawMoney(3, 1001, 35)).toEqual({
      paidCards: 3,
      revenueCents: 3003,
      operatorCents: 1051,
      potAddCents: 1952,
    });
  });

  it('§11.6: a three-way split of $2,080.00 gives the leftover cent to the first card ID', () => {
    expect(splitPot(208_000, ['C-7AB', 'C-0F2', 'C-3K9'])).toEqual([
      { cardId: 'C-0F2', shareCents: 69_334 },
      { cardId: 'C-3K9', shareCents: 69_333 },
      { cardId: 'C-7AB', shareCents: 69_333 },
    ]);
  });

  it('always adds up, and nobody gets more than a cent extra', () => {
    for (const pot of [0, 1, 99, 100, 412_345, 1_000_003]) {
      for (let n = 1; n <= 9; n++) {
        const shares = splitPot(
          pot,
          Array.from({ length: n }, (_, i) => `c${i}`),
        ).map((s) => s.shareCents);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(pot);
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
      }
    }
    expect(splitPot(500, [])).toEqual([]);
  });
});

describe('evaluateCycle', () => {
  const card = (
    cardId: string,
    numbers: number[],
    paidDraws: string[],
    playerId = 'p1',
  ): CycleEntry => ({
    cardId,
    playerId,
    numbers,
    paidDraws,
  });

  it('§11.6: a missed week crosses nothing off, and earlier hits stay', () => {
    const r = evaluateCycle({
      config,
      entries: [card('C-A', [3, 11, 19, 27, 35, 43], ['d1', 'd3'])],
      draws: [
        approved('d1', [5, 11, 22, 27, 40, 48]),
        approved('d2', [3, 9, 14, 35, 38, 41]),
        approved('d3', [1, 3, 17, 30, 33, 46]),
      ],
    });
    expect(r.entries[0]).toMatchObject({ hits: [3, 11, 27], count: 3 });
    expect(r.board).toEqual({ at3: 1, at4: 0, at5: 0, cards: 1 });
    expect(r.draws.map((d) => d.paidCards)).toEqual([1, 0, 1]);
    expect(r.potCents).toBe(1200);
    expect(r.outcome).toEqual({ kind: 'open' });
  });

  it('ignores upcoming, proposed, and skipped draws', () => {
    const r = evaluateCycle({
      config,
      entries: [card('C-A', [1, 2, 3, 4, 5, 6], ['d1', 'd2', 'd3'])],
      draws: [
        { date: 'd1', status: 'skipped', numbers: null },
        { date: 'd2', status: 'proposed', numbers: [1, 2, 3, 4, 5, 6] },
        { date: 'd3', status: 'upcoming', numbers: null },
      ],
    });
    expect(r).toMatchObject({ drawsApproved: 0, potCents: 0, outcome: { kind: 'open' } });
    expect(r.entries[0].count).toBe(0);
  });

  it('a win closes the cycle; identical cards are separate winners and split (D-110)', () => {
    const r = evaluateCycle({
      config,
      entries: [
        card('C-2', [1, 2, 3, 4, 5, 6], ['d1', 'd2']),
        card('C-1', [1, 2, 3, 4, 5, 6], ['d1', 'd2'], 'p1'),
        card('C-3', [1, 2, 3, 40, 41, 42], ['d1', 'd2'], 'p2'),
        // Would also be full on d2, but wasn't paid for it.
        card('C-4', [1, 2, 3, 4, 5, 6], ['d1'], 'p3'),
      ],
      draws: [
        approved('d1', [1, 2, 3, 30, 31, 32]),
        approved('d2', [4, 5, 6, 33, 34, 35]),
        approved('d3', [40, 41, 42, 7, 8, 9]),
      ],
    });
    // d1: 4 paid → 2,400¢; d2: 3 paid → 1,800¢.
    expect(r.potCents).toBe(4200);
    expect(r.operatorCents).toBe(2800);
    expect(r.outcome).toEqual({
      kind: 'won',
      closingDraw: 'd2',
      winners: [
        { cardId: 'C-1', shareCents: 2100 },
        { cardId: 'C-2', shareCents: 2100 },
      ],
    });
    expect(r.afterClose).toEqual(['d3']);
    expect(r.entries.find((e) => e.cardId === 'C-3')?.count).toBe(3); // d3 never counted
  });

  it('§11.6: the 26-week cap splits among the best cards paid for the last draw', () => {
    // 26 approved draws that never complete a card. Two cards reach 5; C-0133 reaches 5 too
    // but skips the last draw, so it can't win.
    const draws: CycleDraw[] = [approved('w01', [1, 2, 3, 4, 5, 49])];
    for (let w = 2; w <= 26; w++)
      draws.push(approved(`w${String(w).padStart(2, '0')}`, [43, 44, 45, 46, 47, 48]));
    const all = draws.map((d) => d.date);
    const r = evaluateCycle({
      config,
      carriedInCents: 412_345 - 77 * 600, // 26 + 26 + 25 paid card-draws at 600¢ each
      entries: [
        card('C-0907', [1, 2, 3, 4, 5, 6], all),
        card('C-0412', [1, 2, 3, 4, 5, 7], all),
        card('C-0133', [1, 2, 3, 4, 5, 8], all.slice(0, 25)),
      ],
      draws,
    });
    expect(r.drawsApproved).toBe(26);
    expect(r.potCents).toBe(412_345);
    expect(r.outcome).toEqual({
      kind: 'capped',
      closingDraw: 'w26',
      winners: [
        { cardId: 'C-0412', shareCents: 206_173 },
        { cardId: 'C-0907', shareCents: 206_172 },
      ],
    });
  });

  it('carries the pot when nobody paid for the 26th draw (D-121)', () => {
    const draws: CycleDraw[] = [];
    for (let w = 1; w <= 26; w++)
      draws.push(approved(`w${String(w).padStart(2, '0')}`, [43, 44, 45, 46, 47, 48]));
    const r = evaluateCycle({
      config,
      entries: [
        card(
          'C-1',
          [1, 2, 3, 4, 5, 6],
          draws.slice(0, 25).map((d) => d.date),
        ),
      ],
      draws,
    });
    expect(r.outcome).toEqual({ kind: 'carried', closingDraw: 'w26', carriedCents: 25 * 600 });
  });

  it('a correction is just a rerun: the same inputs always give the same answer (D-113)', () => {
    const entries = [card('C-1', [1, 2, 3, 4, 5, 6], ['d1'])];
    const typo = evaluateCycle({ config, entries, draws: [approved('d1', [1, 2, 3, 4, 5, 6])] });
    const fixed = evaluateCycle({ config, entries, draws: [approved('d1', [1, 2, 3, 4, 5, 7])] });
    expect(typo.outcome.kind).toBe('won');
    expect(fixed.outcome.kind).toBe('open');
    expect(evaluateCycle({ config, entries, draws: [approved('d1', [1, 2, 3, 4, 5, 7])] })).toEqual(
      fixed,
    );
  });

  it('refuses an approved draw with bad numbers', () => {
    expect(() =>
      evaluateCycle({ config, entries: [], draws: [approved('d1', [1, 2, 3, 4, 5, 5])] }),
    ).toThrow(/d1/);
  });
});
