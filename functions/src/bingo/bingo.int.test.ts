/**
 * Weekly 649 Bingo functions against the Firestore emulator (DATA_MODEL §11.5). Run with
 * `npm run test:rules`. Each function: the right role and input work and are audited; the wrong
 * ones are refused in plain words.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../testSupport.int';
import {
  BOSS,
  CODE,
  CONFIG,
  DEVON,
  FIRST,
  THU,
  at,
  audits,
  seedBingo,
  seedPlayer,
} from './bingoSupport.int';
import { MAX_ATTEMPTS, redeemCode, setCode, setConfig, setLimit } from './members';
import { createCard, retireCard } from './cards';
import { setIntent, setPayment, setPayout, totals } from './payments';
import { approveDraw, correctDraw, enterDraw, skipDraw } from './draws';
import { startCycle } from './cycle';
import { bingoStatus } from './status';

const db = testDb();
const CYCLE = `bingoCycles/${FIRST}`;
const MON = at('2026-11-09T12:00:00-05:00');
const AFTER_DRAW = at('2026-11-11T23:00:00-05:00');

const card = (
  playerId: string,
  numbers: number[] | null,
  now = MON,
  actor: object = { actorUid: playerId },
) =>
  createCard(db, {
    ...(actor as { actorUid: string }),
    playerId,
    numbers,
    byStaff: 'actorRole' in actor || actor === BOSS,
    now,
  });

const pay = (cardId: string, extra: Partial<Parameters<typeof setPayment>[1]> = {}) =>
  setPayment(db, { ...DEVON, cardId, paid: true, method: 'cash', now: MON, ...extra });

describe('membership and settings', () => {
  beforeEach(() => seedBingo(db, { start: false }));

  it('joins with the code, written without dashes or case, once; audited without the code', async () => {
    await seedPlayer(db, 'p4', 'Dale D.', 'dale');
    expect(
      await redeemCode(db, {
        uid: 'dale',
        savedAccount: true,
        playerId: 'p4',
        code: 'tuna 6492 bingo',
        now: THU,
      }),
    ).toEqual({
      joined: true,
      playerId: 'p4',
      already: false,
    });
    expect((await db.doc('bingoMembers/p4').get()).data()).toMatchObject({
      displayName: 'Dale D.',
      paper: false,
      limit: 5,
    });
    expect(
      (
        await redeemCode(db, {
          uid: 'dale',
          savedAccount: true,
          playerId: 'p4',
          code: CODE,
          now: THU,
        })
      ).already,
    ).toBe(true);
    const joined = await audits(db, 'bingo.memberJoined');
    expect(joined).toHaveLength(3);
    expect(JSON.stringify(await audits(db))).not.toContain('6492');
  });

  it('needs a saved account, a profile, and the 18+ confirmation (D-115)', async () => {
    await seedPlayer(db, 'p4', 'Dale D.', 'dale', false);
    await expect(
      redeemCode(db, { uid: 'g', savedAccount: false, playerId: 'p4', code: CODE, now: THU }),
    ).rejects.toThrow(/saved account/);
    await expect(
      redeemCode(db, { uid: 'g', savedAccount: true, playerId: null, code: CODE, now: THU }),
    ).rejects.toThrow(/18 or older/);
    await expect(
      redeemCode(db, { uid: 'dale', savedAccount: true, playerId: 'p4', code: CODE, now: THU }),
    ).rejects.toThrow(/18 or older/);
  });

  it(`locks a login out after ${MAX_ATTEMPTS} wrong codes in an hour, even with the right one (R-14)`, async () => {
    await seedPlayer(db, 'p4', 'Dale D.', 'dale');
    const tryCode = (code: string, now = THU) =>
      redeemCode(db, { uid: 'dale', savedAccount: true, playerId: 'p4', code, now });
    for (let i = 0; i < MAX_ATTEMPTS; i++)
      await expect(tryCode('WRONGCODE1')).rejects.toThrow(/isn’t right/);
    await expect(tryCode(CODE)).rejects.toThrow(/Too many tries/);
    expect((await tryCode(CODE, at('2026-11-05T11:01:00-05:00'))).joined).toBe(true);
    expect((await db.doc('bingoRedeemAttempts/dale').get()).exists).toBe(false);
  });

  it('a new code replaces the old one; short codes and bad settings are refused', async () => {
    await expect(setCode(db, { ...BOSS, code: 'SHORT', now: THU })).rejects.toThrow(/8 to 32/);
    expect(await setCode(db, { ...BOSS, code: 'NEWCODE2027', now: THU })).toEqual({
      codeVersion: 2,
    });
    await seedPlayer(db, 'p4', 'Dale D.', 'dale');
    await expect(
      redeemCode(db, { uid: 'dale', savedAccount: true, playerId: 'p4', code: CODE, now: THU }),
    ).rejects.toThrow();
    await expect(
      setConfig(db, { ...BOSS, config: { ...CONFIG, operatorPct: 101 }, now: THU }),
    ).rejects.toThrow(/operator/);
    await expect(
      setConfig(db, { ...BOSS, config: { ...CONFIG, maxCardsPerPlayer: 6 }, now: THU }),
    ).rejects.toThrow(/1 to 5/);
    await expect(
      setConfig(db, {
        ...BOSS,
        config: { ...CONFIG, cutoff: { ...CONFIG.cutoff, time: '6pm' } },
        now: THU,
      }),
    ).rejects.toThrow(/cutoff/);
  });

  it('paper members: added once by staff with their age checked in person (D-114)', async () => {
    expect((await db.doc('bingoMembers/p3').get()).data()).toMatchObject({
      paper: true,
      addedBy: 'devon',
    });
    const [added] = await audits(db, 'bingo.memberAdded');
    expect(added).toMatchObject({ actorRole: 'counter', after: { ageConfirmedInPerson: true } });
  });

  it('opens one game at a time, with the settings copied in', async () => {
    expect(await startCycle(db, { ...BOSS, test: true, now: THU })).toEqual({ cycleId: FIRST });
    expect((await db.doc(CYCLE).get()).data()).toMatchObject({
      number: 1,
      status: 'open',
      test: true,
      firstDraw: FIRST,
      config: { priceCents: 1000, operatorPct: 40 },
    });
    expect((await db.doc(`${CYCLE}/draws/${FIRST}`).get()).get('status')).toBe('upcoming');
    await expect(startCycle(db, { ...BOSS, test: false, now: THU })).rejects.toThrow(
      /already open/,
    );
  });
});

describe('cards (D-117, D-118)', () => {
  beforeEach(() => seedBingo(db));

  it('makes a card by hand or by quick pick, joining at the first draw', async () => {
    const { cardId, numbers } = await card('p1', [43, 3, 27, 11, 35, 19]);
    expect(numbers).toEqual([3, 11, 19, 27, 35, 43]);
    expect((await db.doc(`${CYCLE}/entries/${cardId}`).get()).data()).toMatchObject({
      playerId: 'p1',
      joinedDraw: FIRST,
      count: 0,
    });
    const quick = await createCard(db, {
      actorUid: 'p1',
      playerId: 'p1',
      numbers: null,
      byStaff: false,
      now: MON,
      random: () => 0,
    });
    expect(quick.numbers).toEqual([1, 2, 3, 4, 5, 6]);
    expect((await db.doc(CYCLE).get()).get('board.cards')).toBe(2);
  });

  it('refuses bad numbers, a non-member, and late joiners in plain words', async () => {
    await expect(card('p1', [1, 2, 3, 4, 5, 5])).rejects.toThrow(/only be picked once/);
    await seedPlayer(db, 'p9', 'Nobody N.', 'nobody');
    await expect(card('p9', null)).rejects.toThrow(/isn’t in bingo/);
    await expect(card('p1', null, at('2026-11-11T18:00:00-05:00'))).rejects.toThrow(
      /open after this one is won/,
    );
  });

  it('holds everyone to the cap and to their own limit, staff included', async () => {
    for (let i = 0; i < 5; i++) await card('p1', null);
    await expect(card('p1', null)).rejects.toThrow(/most cards one person/);
    await setLimit(db, { uid: 'bob', playerId: 'p2', limit: 1, now: MON });
    await card('p2', null);
    await expect(card('p2', null)).rejects.toThrow(/Your limit is 1 card/);
    await setLimit(db, { uid: 'rosalie', playerId: 'p3', pauseCycles: 1, now: MON });
    await expect(card('p3', null, MON, DEVON)).rejects.toThrow(/paused/);
  });

  it('raising a limit waits for the next game; lowering applies now', async () => {
    expect(await setLimit(db, { uid: 'alice', playerId: 'p1', limit: 2, now: MON })).toMatchObject({
      limit: 2,
      pendingLimit: null,
    });
    expect(await setLimit(db, { uid: 'alice', playerId: 'p1', limit: 4, now: MON })).toMatchObject({
      limit: 2,
      pendingLimit: 4,
      pendingFromCycle: 2,
    });
    await expect(
      setLimit(db, { uid: 'alice', playerId: 'p1', limit: 9, now: MON }),
    ).rejects.toThrow(/1 to 5/);
    expect(await audits(db, 'bingo.limit')).toHaveLength(2);
  });

  it('retires a card: the owner or the commissioner, never someone else', async () => {
    const { cardId } = await card('p1', null);
    await expect(
      retireCard(db, { actorUid: 'bob', cardId, playerId: 'p2', now: MON }),
    ).rejects.toThrow(/not your card/);
    await retireCard(db, { actorUid: 'alice', cardId, playerId: 'p1', now: MON });
    expect((await db.doc(`bingoCards/${cardId}`).get()).get('active')).toBe(false);
    await expect(pay(cardId)).rejects.toThrow(/retired/);
  });
});

describe('payments (D-114, D-116, D-119)', () => {
  let cA: string;
  beforeEach(async () => {
    await seedBingo(db);
    cA = (await card('p1', [1, 2, 3, 4, 5, 6])).cardId;
  });

  it('the counter takes cash; only the commissioner confirms an e-Transfer', async () => {
    expect(await pay(cA)).toEqual({ drawDate: FIRST, paid: true, late: false });
    const p = (await db.doc(`${CYCLE}/draws/${FIRST}/payments/${cA}`).get()).data();
    expect(p).toMatchObject({
      paid: true,
      method: 'cash',
      confirmedBy: 'devon',
      late: false,
      playerId: 'p1',
    });
    expect((await db.doc(`${CYCLE}/entries/${cA}`).get()).get('paidDraws')).toEqual([FIRST]);
    expect((await db.doc('bingoMembers/p1').get()).get('spent')).toEqual({
      byCycle: { [FIRST]: 1000 },
      byYear: { 2026: 1000 },
    });
    const { cardId: cB } = await card('p2', null);
    await expect(pay(cB, { method: 'etransfer' })).rejects.toThrow(/Only the commissioner/);
    expect(
      (await setPayment(db, { ...BOSS, cardId: cB, paid: true, method: 'etransfer', now: MON }))
        .paid,
    ).toBe(true);
    await expect(
      setPayment(db, { ...DEVON, cardId: cB, paid: false, drawDate: FIRST, now: MON }),
    ).rejects.toThrow(/undo an e-Transfer/);
  });

  it('§11.6: cash at 5:50 PM recorded at 7:05 PM counts that night, with a reason', async () => {
    const late = {
      receivedAt: at('2026-11-11T17:50:00-05:00'),
      now: at('2026-11-11T19:05:00-05:00'),
    };
    await expect(pay(cA, late)).rejects.toThrow(/reason/);
    expect(await pay(cA, { ...late, reason: 'Handed over before six, busy counter' })).toEqual({
      drawDate: FIRST,
      paid: true,
      late: false,
    });
  });

  it('§11.6: money after the cutoff counts for the next draw, marked late', async () => {
    const r = await pay(cA, {
      receivedAt: at('2026-11-11T18:20:00-05:00'),
      now: at('2026-11-11T18:21:00-05:00'),
      reason: 'e-Transfer came in after six',
    });
    expect(r).toEqual({ drawDate: '2026-11-18', paid: true, late: true });
    expect((await db.doc(`${CYCLE}/draws/2026-11-18`).get()).get('status')).toBe('upcoming');
  });

  it('can’t pay ahead, or put money on an approved draw', async () => {
    await expect(pay(cA, { receivedAt: at('2026-11-10T12:00:00-05:00') })).rejects.toThrow(
      /future/,
    );
    await pay(cA);
    const { cardId: cB } = await card('p2', null, MON);
    await enterDraw(db, { ...DEVON, numbers: [10, 11, 12, 13, 14, 15], now: AFTER_DRAW });
    await approveDraw(db, { ...BOSS, drawDate: FIRST, now: AFTER_DRAW });
    await expect(
      pay(cB, { receivedAt: MON, now: AFTER_DRAW, reason: 'Forgot to put it in' }),
    ).rejects.toThrow(/already approved/);
  });

  it('holds staff to the member’s own limit, and undoes cash', async () => {
    const { cardId: cA2 } = await card('p1', null);
    await pay(cA);
    await setLimit(db, { uid: 'alice', playerId: 'p1', limit: 1, now: MON });
    await expect(pay(cA2)).rejects.toThrow(/limit of 1 card/);
    await setPayment(db, { ...DEVON, cardId: cA, paid: false, drawDate: FIRST, now: MON });
    expect((await db.doc(`${CYCLE}/entries/${cA}`).get()).get('paidDraws')).toEqual([]);
    expect((await db.doc('bingoMembers/p1').get()).get('spent.byCycle')).toEqual({ [FIRST]: 0 });
    expect(await audits(db, 'bingo.payment')).toHaveLength(2);
  });

  it('the member says how they’ll pay, without marking anything paid', async () => {
    expect(await setIntent(db, { playerId: 'p1', cardId: cA, intent: 'etransfer' })).toEqual({
      drawDate: FIRST,
    });
    expect((await db.doc(`${CYCLE}/draws/${FIRST}/payments/${cA}`).get()).data()).toMatchObject({
      paid: false,
      intent: 'etransfer',
    });
    await expect(setIntent(db, { playerId: 'p2', cardId: cA, intent: 'cash' })).rejects.toThrow(
      /not your card/,
    );
    await pay(cA);
    expect((await db.doc(`${CYCLE}/draws/${FIRST}/payments/${cA}`).get()).data()).toMatchObject({
      paid: true,
      intent: 'etransfer',
    });
  });

  it('totals only: share from 4-5 card players and how many are at the cap (D-128)', async () => {
    for (let i = 0; i < 4; i++) await pay((await card('p2', null)).cardId);
    await pay(cA);
    const t = await totals(db);
    expect(t.draws).toEqual([
      { drawDate: FIRST, paidCards: 5, players: 2, heavyShare: 0.8, atCap: 0 },
    ]);
    expect(JSON.stringify(t)).not.toMatch(/p1|p2|Alice|Bob/);
  });
});

describe('draws (D-114, D-126, D-129)', () => {
  let cA: string;
  let cB: string;
  beforeEach(async () => {
    await seedBingo(db);
    cA = (await card('p1', [1, 2, 3, 4, 5, 6])).cardId;
    cB = (await card('p2', [1, 2, 3, 40, 41, 42])).cardId;
    await pay(cA);
    await pay(cB);
  });

  it('numbers go in after the cutoff, and approval works out the game', async () => {
    await expect(
      enterDraw(db, { ...DEVON, numbers: [1, 2, 3, 30, 31, 32], now: MON }),
    ).rejects.toThrow(/hasn’t happened yet/);
    await enterDraw(db, { ...DEVON, numbers: [32, 31, 30, 3, 2, 1], now: AFTER_DRAW });
    expect((await db.doc(`${CYCLE}/draws/${FIRST}`).get()).data()).toMatchObject({
      status: 'proposed',
      numbers: [1, 2, 3, 30, 31, 32],
    });
    const r = await approveDraw(db, { ...DEVON, drawDate: FIRST, now: AFTER_DRAW });
    expect(r.kind).toBe('open');
    expect((await db.doc(`${CYCLE}/entries/${cA}`).get()).data()).toMatchObject({
      hits: [1, 2, 3],
      count: 3,
    });
    expect((await db.doc(CYCLE).get()).data()).toMatchObject({
      potCents: 1200,
      operatorCents: 800,
      drawsApproved: 1,
      board: { at3: 2, cards: 2 },
    });
    expect((await db.doc(`${CYCLE}/draws/${FIRST}`).get()).data()).toMatchObject({
      status: 'approved',
      approvedBy: 'devon',
      paidCards: 2,
      potAddCents: 1200,
    });
    await expect(approveDraw(db, { ...BOSS, drawDate: FIRST, now: AFTER_DRAW })).rejects.toThrow(
      /isn’t waiting/,
    );
  });

  it('a win closes the game, splits the pot, and opens the next with every card', async () => {
    await enterDraw(db, { ...DEVON, numbers: [1, 2, 3, 4, 5, 6], now: AFTER_DRAW });
    const r = await approveDraw(db, { ...BOSS, drawDate: FIRST, now: AFTER_DRAW });
    expect(r).toMatchObject({ kind: 'won', closingDraw: FIRST, nextCycleId: '2026-11-18' });
    expect((await db.doc(CYCLE).get()).data()).toMatchObject({
      status: 'won',
      winners: [
        {
          cardId: cA,
          playerId: 'p1',
          displayName: 'Alice A.',
          hits: 6,
          shareCents: 1200,
          paidOut: null,
        },
      ],
    });
    const next = (await db.doc('bingoCycles/2026-11-18').get()).data();
    expect(next).toMatchObject({ number: 2, status: 'open', firstDraw: '2026-11-18', potCents: 0 });
    expect((await db.collection('bingoCycles/2026-11-18/entries').get()).size).toBe(2);
  });

  it('only the commissioner corrects; a typo fixed after approval reworks the game', async () => {
    await enterDraw(db, { ...DEVON, numbers: [1, 2, 3, 30, 31, 32], now: AFTER_DRAW });
    await approveDraw(db, { ...DEVON, drawDate: FIRST, now: AFTER_DRAW });
    await expect(
      correctDraw(db, {
        ...BOSS,
        cycleId: FIRST,
        drawDate: FIRST,
        numbers: [1, 2, 40, 41, 42, 32],
        reason: '',
        now: AFTER_DRAW,
      }),
    ).rejects.toThrow(/reason/);
    await correctDraw(db, {
      ...BOSS,
      cycleId: FIRST,
      drawDate: FIRST,
      numbers: [1, 2, 40, 41, 42, 32],
      reason: 'Misread the ticket',
      now: AFTER_DRAW,
    });
    expect((await db.doc(`${CYCLE}/entries/${cA}`).get()).get('hits')).toEqual([1, 2]);
    expect((await db.doc(`${CYCLE}/entries/${cB}`).get()).get('hits')).toEqual([1, 2, 40, 41, 42]);
    expect((await db.doc(`${CYCLE}/draws/${FIRST}`).get()).get('correction')).toMatchObject({
      before: [1, 2, 3, 30, 31, 32],
      reason: 'Misread the ticket',
    });
  });

  it('D-129: a correction that takes a win away reopens the game while the next is untouched', async () => {
    await enterDraw(db, { ...DEVON, numbers: [1, 2, 3, 4, 5, 6], now: AFTER_DRAW });
    await approveDraw(db, { ...BOSS, drawDate: FIRST, now: AFTER_DRAW });
    const r = await correctDraw(db, {
      ...BOSS,
      cycleId: FIRST,
      drawDate: FIRST,
      numbers: [1, 2, 3, 4, 5, 7],
      reason: 'Typed 6 for 7',
      now: AFTER_DRAW,
    });
    expect(r).toMatchObject({ reopened: true, kind: 'open' });
    expect((await db.doc(CYCLE).get()).data()).toMatchObject({ status: 'open', winners: [] });
    expect((await db.doc('bingoCycles/2026-11-18').get()).exists).toBe(false);
    expect((await db.doc(`${CYCLE}/draws/2026-11-18`).get()).get('status')).toBe('upcoming');
  });

  it('D-129: refused once the next game took money, or a winner was paid', async () => {
    await enterDraw(db, { ...DEVON, numbers: [1, 2, 3, 4, 5, 6], now: AFTER_DRAW });
    await approveDraw(db, { ...BOSS, drawDate: FIRST, now: AFTER_DRAW });
    await pay(cB, { now: at('2026-11-12T10:00:00-05:00') });
    const fix = {
      ...BOSS,
      cycleId: FIRST,
      drawDate: FIRST,
      numbers: [1, 2, 3, 4, 5, 7],
      reason: 'Typed 6 for 7',
      now: AFTER_DRAW,
    };
    await expect(correctDraw(db, fix)).rejects.toThrow(/already taken money/);
    await setPayout(db, {
      ...DEVON,
      cycleId: FIRST,
      cardId: cA,
      paid: true,
      method: 'cash',
      now: AFTER_DRAW,
    });
    await expect(correctDraw(db, fix)).rejects.toThrow(/has been paid/);
  });

  it('a skipped draw changes nothing and moves its money on (D-129)', async () => {
    expect(
      await skipDraw(db, { ...BOSS, drawDate: FIRST, reason: 'Draw postponed', now: AFTER_DRAW }),
    ).toEqual({ moved: 2, nextDraw: '2026-11-18' });
    expect((await db.doc(`${CYCLE}/draws/${FIRST}`).get()).get('status')).toBe('skipped');
    expect((await db.doc(`${CYCLE}/draws/2026-11-18/payments/${cA}`).get()).data()).toMatchObject({
      paid: true,
      movedFrom: FIRST,
    });
    expect((await db.doc(`${CYCLE}/entries/${cA}`).get()).get('paidDraws')).toEqual(['2026-11-18']);
    expect((await db.doc(CYCLE).get()).get('drawsApproved')).toBe(0);
  });

  it('payouts: the counter in cash, the commissioner either way and the undo', async () => {
    await enterDraw(db, { ...DEVON, numbers: [1, 2, 3, 4, 5, 6], now: AFTER_DRAW });
    await approveDraw(db, { ...BOSS, drawDate: FIRST, now: AFTER_DRAW });
    await expect(
      setPayout(db, {
        ...DEVON,
        cycleId: FIRST,
        cardId: cA,
        paid: true,
        method: 'etransfer',
        now: AFTER_DRAW,
      }),
    ).rejects.toThrow(/cash payout only/);
    await expect(
      setPayout(db, {
        ...BOSS,
        cycleId: FIRST,
        cardId: cB,
        paid: true,
        method: 'cash',
        now: AFTER_DRAW,
      }),
    ).rejects.toThrow(/didn’t win/);
    await setPayout(db, {
      ...BOSS,
      cycleId: FIRST,
      cardId: cA,
      paid: true,
      method: 'etransfer',
      now: AFTER_DRAW,
    });
    expect((await db.doc(CYCLE).get()).get('winners')[0].paidOut).toMatchObject({
      method: 'etransfer',
      by: 'boss',
    });
    await expect(
      setPayout(db, { ...DEVON, cycleId: FIRST, cardId: cA, paid: false, now: AFTER_DRAW }),
    ).rejects.toThrow(/cash payout only/);
    await setPayout(db, { ...BOSS, cycleId: FIRST, cardId: cA, paid: false, now: AFTER_DRAW });
    expect(await audits(db, 'bingo.payout')).toHaveLength(2);
  });
});

describe('bingoStatus (D-132)', () => {
  beforeEach(() => seedBingo(db, { start: false }));

  it('while off: only members and staff see bingo; once on, everyone can find the code page', async () => {
    expect(await bingoStatus(db, { playerId: 'p9', staff: false })).toMatchObject({
      visible: false,
      enabled: false,
      member: false,
    });
    expect(await bingoStatus(db, { playerId: null, staff: false })).toMatchObject({
      visible: false,
    });
    expect(await bingoStatus(db, { playerId: 'p1', staff: false })).toMatchObject({
      visible: true,
      member: true,
    });
    expect(await bingoStatus(db, { playerId: null, staff: true })).toMatchObject({
      visible: true,
      staff: true,
    });
    expect((await bingoStatus(db, { playerId: 'p9', staff: false })).rules).toBeNull();
    expect((await bingoStatus(db, { playerId: 'p1', staff: false })).rules).toEqual({
      priceCents: 1000,
      operatorPct: 40,
      maxWeeks: 26,
    });
    await setConfig(db, { ...BOSS, config: { ...CONFIG, enabled: true }, now: THU });
    expect(await bingoStatus(db, { playerId: 'p9', staff: false })).toMatchObject({
      visible: true,
      enabled: true,
      member: false,
    });
  });
});
