/**
 * Two whole games of Tunas 649 Bingo, from cards to payout, against the Firestore emulator
 * (BINGO_PLAN Sprint 13's acceptance). Run with `npm run test:rules`.
 *
 * Game 1: four cards; a missed week; cash handed over before six and typed in after; late money;
 * a typo approved, then corrected into a two-way tie; payouts by the counter and the commissioner.
 * Game 2: opens with the late money moved in and the new settings (a 3-week cap); a skipped draw;
 * ends at the cap with the best paid card taking the pot.
 */
import { describe, expect, it } from 'vitest';
import { testDb } from '../testSupport.int';
import { BOSS, CONFIG, DEVON, at, audits, seedBingo } from './bingoSupport.int';
import { setConfig } from './members';
import { createCard } from './cards';
import { setPayment, setPayout } from './payments';
import { approveDraw, correctDraw, enterDraw, skipDraw } from './draws';
import { describeAudit } from '../../../shared/auditText';

const db = testDb();
const get = async (path: string) => (await db.doc(path).get()).data()!;

describe('two games, start to finish', () => {
  it('runs as DATA_MODEL §11 says, and every cent adds up', async () => {
    await seedBingo(db);
    const G1 = 'bingoCycles/2026-11-11';
    const MON1 = at('2026-11-09T12:00:00-05:00');

    // ---- Game 1: cards (Alice, Bob twice, Rosalie on paper through Devon) ----
    const mk = async (
      playerId: string,
      numbers: number[],
      actor: { actorUid: string } = { actorUid: playerId },
    ) =>
      (
        await createCard(db, {
          ...actor,
          playerId,
          numbers,
          byStaff: actor !== undefined && 'actorRole' in actor,
          now: MON1,
        })
      ).cardId;
    const cA = await mk('p1', [1, 2, 3, 4, 5, 6]);
    const cB1 = await mk('p2', [1, 2, 3, 4, 5, 6]); // identical to Alice's (D-110)
    const cB2 = await mk('p2', [10, 11, 12, 13, 14, 15]);
    const cR = await mk('p3', [1, 2, 3, 4, 40, 41], DEVON);
    expect((await db.doc(`bingoCards/${cR}`).get()).get('source')).toBe('paper');

    // New settings mid-game apply from the next game only.
    await setConfig(db, { ...BOSS, config: { ...CONFIG, maxWeeks: 3 }, now: MON1 });

    // ---- Week 1: everyone pays cash at the counter ----
    for (const c of [cA, cB1, cB2, cR])
      await setPayment(db, { ...DEVON, cardId: c, paid: true, method: 'cash', now: MON1 });
    await enterDraw(db, {
      ...DEVON,
      numbers: [1, 2, 3, 30, 31, 32],
      now: at('2026-11-11T23:00:00-05:00'),
    });
    await approveDraw(db, {
      ...DEVON,
      drawDate: '2026-11-11',
      now: at('2026-11-11T23:05:00-05:00'),
    });

    // ---- Week 2 ----
    await setPayment(db, {
      ...BOSS,
      cardId: cA,
      paid: true,
      method: 'etransfer',
      now: at('2026-11-16T10:00:00-05:00'),
    });
    await setPayment(db, {
      ...DEVON,
      cardId: cB2,
      paid: true,
      method: 'cash',
      now: at('2026-11-16T10:00:00-05:00'),
    });
    await setPayment(db, {
      ...DEVON,
      cardId: cB1,
      paid: true,
      method: 'cash',
      receivedAt: at('2026-11-18T17:50:00-05:00'),
      now: at('2026-11-18T19:05:00-05:00'),
      reason: 'Handed over before six, busy counter',
    });
    // Rosalie misses week 2: her cash comes at 6:20 PM, so it's for next week, late.
    expect(
      await setPayment(db, {
        ...DEVON,
        cardId: cR,
        paid: true,
        method: 'cash',
        receivedAt: at('2026-11-18T18:20:00-05:00'),
        now: at('2026-11-18T18:25:00-05:00'),
        reason: 'Came in after six',
      }),
    ).toEqual({ drawDate: '2026-11-25', paid: true, late: true });

    // The ticket says 4 5 6 33 34 35; Devon types 7 for 6 and approves it.
    await enterDraw(db, {
      ...DEVON,
      numbers: [4, 5, 7, 33, 34, 35],
      now: at('2026-11-18T23:00:00-05:00'),
    });
    expect(
      (
        await approveDraw(db, {
          ...DEVON,
          drawDate: '2026-11-18',
          now: at('2026-11-18T23:05:00-05:00'),
        })
      ).kind,
    ).toBe('open');
    expect((await get(`${G1}/entries/${cA}`)).count).toBe(5);
    expect((await get(G1)).board).toEqual({ at3: 1, at4: 0, at5: 2, cards: 4 });

    // The commissioner catches it Thursday morning. The fix makes a two-way tie.
    const thu = at('2026-11-19T09:00:00-05:00');
    const fixed = await correctDraw(db, {
      ...BOSS,
      cycleId: '2026-11-11',
      drawDate: '2026-11-18',
      numbers: [4, 5, 6, 33, 34, 35],
      reason: 'Ticket says 6, typed 7',
      now: thu,
    });
    expect(fixed).toMatchObject({
      kind: 'won',
      closingDraw: '2026-11-18',
      nextCycleId: '2026-11-25',
    });

    // Week 1: 4 paid (2,400¢ to the pot). Week 2: 3 paid (1,800¢). Rosalie's late money is not in it.
    const g1 = await get(G1);
    expect(g1).toMatchObject({
      status: 'won',
      potCents: 4200,
      operatorCents: 2800,
      drawsApproved: 2,
    });
    expect(
      g1.winners.map((w: { cardId: string; shareCents: number }) => [w.cardId, w.shareCents]),
    ).toEqual([cA, cB1].sort().map((id) => [id, 2100]));
    expect((await get(`${G1}/entries/${cR}`)).hits).toEqual([1, 2, 3]); // the 4 came in the week she missed

    // ---- Payouts ----
    await setPayout(db, {
      ...DEVON,
      cycleId: '2026-11-11',
      cardId: cB1,
      paid: true,
      method: 'cash',
      now: thu,
    });
    await setPayout(db, {
      ...BOSS,
      cycleId: '2026-11-11',
      cardId: cA,
      paid: true,
      method: 'etransfer',
      now: thu,
    });
    expect((await get(G1)).winners.every((w: { paidOut: unknown }) => w.paidOut !== null)).toBe(
      true,
    );

    // ---- Game 2: the new settings, every card, Rosalie's late money moved in ----
    const G2 = 'bingoCycles/2026-11-25';
    expect(await get(G2)).toMatchObject({
      number: 2,
      status: 'open',
      config: { maxWeeks: 3 },
      potCents: 0,
    });
    expect((await db.collection(`${G2}/entries`).get()).size).toBe(4);
    expect((await get(`${G2}/entries/${cR}`)).paidDraws).toEqual(['2026-11-25']);
    expect(await get(`${G2}/draws/2026-11-25/payments/${cR}`)).toMatchObject({
      paid: true,
      late: true,
      movedFrom: '2026-11-11',
    });
    expect((await db.doc(`${G1}/draws/2026-11-25`).get()).exists).toBe(false);
    expect((await get('bingoMembers/p3')).spent).toEqual({
      byCycle: { '2026-11-11': 1000, '2026-11-25': 1000 },
      byYear: { 2026: 2000 },
    });

    const payAll = async (cards: string[], iso: string) => {
      for (const c of cards)
        await setPayment(db, { ...DEVON, cardId: c, paid: true, method: 'cash', now: at(iso) });
    };
    // 11-25: Alice, Bob's first card, and Rosalie (already in). Bob's second card sits out.
    await payAll([cA, cB1], '2026-11-23T12:00:00-05:00');
    await enterDraw(db, {
      ...BOSS,
      numbers: [1, 2, 7, 8, 9, 10],
      now: at('2026-11-25T23:00:00-05:00'),
    });
    await approveDraw(db, {
      ...BOSS,
      drawDate: '2026-11-25',
      now: at('2026-11-25T23:05:00-05:00'),
    });
    // 12-02: paid, then the draw is postponed; the money moves to 12-09.
    await payAll([cA, cB1, cR], '2026-11-30T12:00:00-05:00');
    expect(
      await skipDraw(db, {
        ...BOSS,
        drawDate: '2026-12-02',
        reason: 'Draw postponed by the lottery',
        now: at('2026-12-02T20:00:00-05:00'),
      }),
    ).toEqual({ moved: 3, nextDraw: '2026-12-09' });
    await enterDraw(db, {
      ...BOSS,
      numbers: [3, 4, 40, 20, 21, 22],
      now: at('2026-12-09T23:00:00-05:00'),
    });
    await approveDraw(db, {
      ...DEVON,
      drawDate: '2026-12-09',
      now: at('2026-12-09T23:05:00-05:00'),
    });
    // 12-16, the third approved draw and the cap: Bob doesn't pay.
    await payAll([cA, cR], '2026-12-14T12:00:00-05:00');
    await enterDraw(db, {
      ...DEVON,
      numbers: [44, 45, 46, 47, 48, 49],
      now: at('2026-12-16T23:00:00-05:00'),
    });
    const capped = await approveDraw(db, {
      ...BOSS,
      drawDate: '2026-12-16',
      now: at('2026-12-17T08:00:00-05:00'),
    });
    expect(capped).toMatchObject({
      kind: 'capped',
      closingDraw: '2026-12-16',
      nextCycleId: '2026-12-23',
    });

    // Rosalie's paper card has 5 (1 2 3 4 40) and was paid for the last draw: the pot is hers.
    // Pot: 11-25 3 paid, 12-09 3 paid (moved), 12-16 2 paid = 8 × 600¢.
    const g2 = await get(G2);
    expect(g2).toMatchObject({ status: 'capped', potCents: 4800, drawsApproved: 3 });
    expect(g2.winners).toEqual([
      expect.objectContaining({
        cardId: cR,
        playerId: 'p3',
        displayName: 'Rosalie R.',
        hits: 5,
        shareCents: 4800,
      }),
    ]);
    expect((await get(`${G2}/draws/2026-12-02`)).status).toBe('skipped');
    await setPayout(db, {
      ...DEVON,
      cycleId: '2026-11-25',
      cardId: cR,
      paid: true,
      method: 'cash',
      now: at('2026-12-17T10:00:00-05:00'),
    });

    // ---- Every cent adds up: spend = winnings + operator share ----
    const spent = (await db.collection('bingoMembers').get()).docs.reduce(
      (sum, d) =>
        sum +
        Object.values(d.get('spent.byCycle') as Record<string, number>).reduce((a, b) => a + b, 0),
      0,
    );
    const g1Total = g1.potCents + g1.operatorCents;
    const g2Total = g2.potCents + g2.operatorCents;
    expect(spent).toBe(g1Total + g2Total); // nothing paid yet in game 3
    expect(g1Total).toBe(7 * 1000);
    expect(g2Total).toBe(8 * 1000);

    // ---- The audit log reads in plain words, all of it ----
    const log = await audits(db);
    const actions = new Set(log.map((a) => a.action));
    for (const a of [
      'bingo.memberJoined',
      'bingo.memberAdded',
      'bingo.code',
      'bingo.config',
      'bingo.cardCreated',
      'bingo.payment',
      'bingo.drawEntered',
      'bingo.drawApproved',
      'bingo.drawCorrected',
      'bingo.drawSkipped',
      'bingo.payout',
      'bingo.cycle',
    ]) {
      expect(actions).toContain(a);
    }
    for (const entry of log) {
      const text = describeAudit(entry as never, () => undefined);
      expect(text.what).not.toBe(entry.action);
    }
    expect(
      log.filter((a) => a.actorRole === 'counter').every((a) => a.actorEmail === 'devon@shop.test'),
    ).toBe(true);
  });
});
