/**
 * The weekly job against the Firestore emulator: payments, counters, the scheduled lock, results,
 * the winner, and the payout. Run with `npm run test:rules` (it starts the emulator).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { evaluateWeek, writeEntryRecords } from './evaluate';
import { lockDueWeeks } from './lockWeeks';
import { listEntries } from './entriesList';
import {
  correctResults,
  enterResults,
  markPayout,
  previewWinner,
  publishWinner,
  setPayment,
} from './weekActions';
import { recountWeek } from './weekCounters';
import {
  ALL_HOME,
  WEEK,
  YEAR,
  clearDb,
  seedEntry,
  seedWeek,
  testDb,
  weekPath,
} from './testSupport.int';

const db = testDb();
const ADMIN = 'boss';
const ref = { year: YEAR, weekId: WEEK, actorUid: ADMIN };

const auditActions = async () =>
  (await db.collection('auditLog').orderBy('at').get()).docs.map((d) => d.get('action') as string);

beforeEach(async () => {
  await clearDb();
});

describe('setPayment', () => {
  it('marks paid with who and when, undoes it, and logs each change but not a repeat', async () => {
    await seedWeek(db);
    await seedEntry(db, 'dale', { payment: 'unpaid', method: 'etransfer' });
    const pay = () => db.doc(`${weekPath()}/entries/dale/payment/current`).get();

    expect(await setPayment(db, { ...ref, playerId: 'dale', status: 'paid' })).toEqual({
      changed: true,
      status: 'paid',
    });
    let doc = await pay();
    expect(doc.get('paymentStatus')).toBe('paid');
    expect(doc.get('paidBy')).toBe(ADMIN);
    expect(doc.get('paidAt')).toBeTruthy();
    expect(doc.get('paymentIntent')).toBe('already_did');

    expect(await setPayment(db, { ...ref, playerId: 'dale', status: 'paid' })).toMatchObject({
      changed: false,
    });

    expect(await setPayment(db, { ...ref, playerId: 'dale', status: 'unpaid' })).toEqual({
      changed: true,
      status: 'unpaid',
    });
    doc = await pay();
    expect(doc.get('paymentStatus')).toBe('unpaid');
    expect(doc.get('paidAt')).toBeUndefined();
    expect(doc.get('paidBy')).toBeUndefined();
    expect(doc.get('paymentMethod')).toBe('etransfer'); // what the player declared is kept

    const log = await db.collection('auditLog').orderBy('at').get();
    expect(log.docs.map((d) => d.get('action'))).toEqual(['payment.set', 'payment.set']);
    expect(log.docs[0].data()).toMatchObject({
      actorUid: ADMIN,
      year: YEAR,
      weekId: WEEK,
      before: { paymentStatus: 'unpaid' },
      after: { paymentStatus: 'paid' },
    });
  });

  it("creates the payment for a player who hasn't said how they'll pay, once the admin says how", async () => {
    await seedWeek(db);
    await seedEntry(db, 'sam', { payment: null });
    await expect(setPayment(db, { ...ref, playerId: 'sam', status: 'paid' })).rejects.toMatchObject(
      {
        code: 'failed-precondition',
      },
    );
    await setPayment(db, { ...ref, playerId: 'sam', status: 'paid', method: 'cash' });
    const doc = await db.doc(`${weekPath()}/entries/sam/payment/current`).get();
    expect(doc.data()).toMatchObject({
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      paymentIntent: 'already_did',
    });
  });

  it('refuses a player with no entry', async () => {
    await seedWeek(db);
    await expect(
      setPayment(db, { ...ref, playerId: 'ghost', status: 'paid', method: 'cash' }),
    ).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('counters and the scheduled lock', () => {
  it('recounts entries and paid entries from the data, and ignores a leftover payment with no entry', async () => {
    await seedWeek(db, { status: 'open', lockInHours: 24 });
    await seedEntry(db, 'a', { payment: 'paid' });
    await seedEntry(db, 'b', { payment: 'unpaid' });
    await seedEntry(db, 'c', { payment: null });
    await db
      .doc(`${weekPath()}/entries/gone/payment/current`)
      .set({ paymentMethod: 'cash', paymentIntent: 'will_do', paymentStatus: 'paid' });

    expect(await recountWeek(db, YEAR, WEEK)).toEqual({ entryCount: 3, paidCount: 1 });
    expect(await recountWeek(db, YEAR, WEEK)).toEqual({ entryCount: 3, paidCount: 1 }); // safe to repeat
    const week = await db.doc(weekPath()).get();
    expect(week.get('entryCount')).toBe(3);
    expect(week.get('paidCount')).toBe(1);
    expect(await recountWeek(db, YEAR, 'wk99')).toBeNull();
  });

  it('locks only open weeks past their lock time, reveals them, logs it, and does nothing the second time', async () => {
    await seedWeek(db, { weekId: 'wk01', status: 'open', lockInHours: -0.5 }); // due
    await seedWeek(db, { weekId: 'wk02', status: 'open', lockInHours: 6 }); // not yet
    await seedWeek(db, { weekId: 'wk03', status: 'draft', lockInHours: -2 }); // draft: never
    await seedEntry(db, 'a', { payment: 'paid', weekId: 'wk01' });

    expect(await lockDueWeeks(db, Date.now())).toEqual(['2026/wk01']);
    const [w1, w2, w3] = await Promise.all(
      ['wk01', 'wk02', 'wk03'].map((w) => db.doc(weekPath(w)).get()),
    );
    expect([w1.get('status'), w1.get('revealed')]).toEqual(['locked', true]);
    expect([w2.get('status'), w2.get('revealed')]).toEqual(['open', false]);
    expect(w3.get('status')).toBe('draft');
    expect(w1.get('paidCount')).toBe(1); // reconciled at the lock

    const log = await db.collection('auditLog').get();
    expect(log.size).toBe(1);
    expect(log.docs[0].data()).toMatchObject({
      actorUid: 'system:lockWeeks',
      action: 'week.status',
      weekId: 'wk01',
    });
    expect(await lockDueWeeks(db, Date.now())).toEqual([]);
    expect((await db.collection('auditLog').get()).size).toBe(1);
  });
});

describe('results, records, and the winner', () => {
  /** Eleven paid entries, A and B tied on 12 wins (the paper-sheet tiebreak), C best but unpaid. */
  async function seedField() {
    await seedWeek(db);
    await seedEntry(db, 'a', { name: 'Dale D.', wins: 12, guess: 58, payment: 'paid' });
    await seedEntry(db, 'b', { name: 'Jen K.', wins: 12, guess: 45, payment: 'paid' });
    await seedEntry(db, 'c', { name: 'Unpaid Una', wins: 14, guess: 46, payment: 'unpaid' });
    await seedEntry(db, 'd', { name: 'Troy T.', wins: 9, guess: 40, payment: 'paid' });
    await seedEntry(db, 'e', { name: 'No Pay Nate', wins: 15, guess: 46, payment: null });
    for (let i = 0; i < 7; i++)
      await seedEntry(db, `x${i}`, { name: `Extra ${i}`, wins: 5, guess: 30, payment: 'paid' });
  }

  it('only accepts results while the week is locked, validates them, and logs changes (not repeats)', async () => {
    await seedWeek(db, { status: 'open', lockInHours: 6 });
    await expect(
      enterResults(db, { ...ref, results: ALL_HOME, mnfTotal: 46 }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });

    await db.doc(weekPath()).update({ status: 'locked' });
    await expect(
      enterResults(db, { ...ref, results: { g99: 'home' }, mnfTotal: null }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(enterResults(db, { ...ref, results: {}, mnfTotal: 999 })).rejects.toMatchObject({
      code: 'invalid-argument',
    });

    expect(await enterResults(db, { ...ref, results: ALL_HOME, mnfTotal: 46 })).toEqual({
      changed: true,
    });
    expect(await enterResults(db, { ...ref, results: { ...ALL_HOME }, mnfTotal: 46 })).toEqual({
      changed: false,
    });
    const week = await db.doc(weekPath()).get();
    expect(week.get('mnfTotal')).toBe(46);
    expect(Object.keys(week.get('results'))).toHaveLength(15);
    expect(await auditActions()).toEqual(['week.results']);

    // Unsetting a game is possible while locked.
    const { g01, ...rest } = ALL_HOME;
    void g01;
    expect(await enterResults(db, { ...ref, results: rest, mnfTotal: null })).toEqual({
      changed: true,
    });
    expect(Object.keys((await db.doc(weekPath()).get()).get('results'))).toHaveLength(14);
  });

  it('works out the winner from the picks: unpaid entries cannot win, and the paper-sheet tiebreak decides', async () => {
    await seedField();
    await enterResults(db, { ...ref, results: ALL_HOME, mnfTotal: 46 });
    const ev = await evaluateWeek(db, YEAR, WEEK);

    expect(ev?.complete).toBe(true);
    expect(ev?.contenders.slice(0, 3).map((c) => [c.displayName, c.wins, c.paid])).toEqual([
      ['No Pay Nate', 15, false],
      ['Unpaid Una', 14, false],
      ['Dale D.', 12, true],
    ]);
    expect(ev?.winner.ok && ev.winner.outcome).toMatchObject({
      playerIds: ['a'],
      decision: 'tiebreaker',
      mnfPrediction: 58,
      potCents: 10 * 2000, // 10 paid entries
      shareCents: 10 * 2000,
      tiedPlayerIds: expect.arrayContaining(['a', 'b']),
    });
    expect(ev?.explanation).toContain("Dale D.'s guess of 58");
  });

  it('writes each entry its record from the results, and clears them when the results are cleared', async () => {
    await seedField();
    await enterResults(db, { ...ref, results: ALL_HOME, mnfTotal: 46 });
    expect(await writeEntryRecords(db, YEAR, WEEK)).toBe(12);
    const a = await db.doc(`${weekPath()}/entries/a`).get();
    expect(a.get('record')).toEqual({ wins: 12, losses: 3 });
    expect(await writeEntryRecords(db, YEAR, WEEK)).toBe(0); // nothing changed, nothing written

    await enterResults(db, { ...ref, results: {}, mnfTotal: null });
    await writeEntryRecords(db, YEAR, WEEK);
    expect((await db.doc(`${weekPath()}/entries/a`).get()).get('record')).toBeUndefined();
  });

  it('previews standings and the pot while the results are still coming in', async () => {
    await seedField();
    await enterResults(db, {
      ...ref,
      results: { g01: 'home', g02: 'home', g03: 'home' },
      mnfTotal: null,
    });
    const preview = await previewWinner(db, YEAR, WEEK);
    expect(preview).toMatchObject({
      complete: false,
      gamesWithResults: 3,
      totalGames: 15,
      potCents: 20_000,
      paidCount: 10,
      entryCount: 12,
    });
    expect(preview.contenders[0]).toMatchObject({ remaining: 12, bestPossible: 15 });
  });

  it('publishes only a complete week, only the winner the admin reviewed, once, and logs it', async () => {
    await seedField();
    await expect(publishWinner(db, { ...ref, expectedPlayerIds: ['a'] })).rejects.toMatchObject({
      code: 'failed-precondition',
    }); // no results yet

    await enterResults(db, { ...ref, results: ALL_HOME, mnfTotal: 46 });
    await expect(publishWinner(db, { ...ref, expectedPlayerIds: ['b'] })).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('changed since you last looked'),
    });
    expect((await db.doc(weekPath()).get()).get('status')).toBe('locked');

    const published = await publishWinner(db, { ...ref, expectedPlayerIds: ['a'] });
    expect(published).toMatchObject({
      playerIds: ['a'],
      displayNames: ['Dale D.'],
      decision: 'tiebreaker',
    });

    const week = await db.doc(weekPath()).get();
    expect(week.get('status')).toBe('final');
    expect(week.get('winner')).toMatchObject({
      playerIds: ['a'],
      record: { wins: 12, losses: 3 },
      potCents: 20_000,
      shareCents: 20_000,
      leftoverCents: 0,
      publishedAt: expect.anything(),
    });
    expect((await db.doc(`${weekPath()}/entries/b`).get()).get('record')).toEqual({
      wins: 12,
      losses: 3,
    });

    await expect(publishWinner(db, { ...ref, expectedPlayerIds: ['a'] })).rejects.toMatchObject({
      message: 'The winner is already published.',
    });
    await expect(
      enterResults(db, { ...ref, results: ALL_HOME, mnfTotal: 47 }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(await auditActions()).toEqual(['week.results', 'week.winnerPublished']);
    const log = (await db.collection('auditLog').orderBy('at').get()).docs[1].data();
    expect(log).toMatchObject({
      actorUid: ADMIN,
      before: { status: 'locked' },
      after: { status: 'final' },
    });
  });

  it("won't publish when nobody has paid, and a split pot reports leftover cents", async () => {
    await seedWeek(db);
    await seedEntry(db, 'a', { wins: 10, payment: 'unpaid' });
    await enterResults(db, { ...ref, results: ALL_HOME, mnfTotal: 46 });
    await expect(publishWinner(db, { ...ref, expectedPlayerIds: ['a'] })).rejects.toMatchObject({
      message: expect.stringContaining('Nobody with a paid entry'),
    });

    await clearDb();
    await seedWeek(db);
    for (const id of ['a', 'b', 'c'])
      await seedEntry(db, id, { wins: 12, guess: 50, payment: 'paid' });
    for (let i = 0; i < 38; i++)
      await seedEntry(db, `x${i}`, { wins: 5, guess: 30, payment: 'paid' });
    await enterResults(db, { ...ref, results: ALL_HOME, mnfTotal: 46 });
    const out = await publishWinner(db, { ...ref, expectedPlayerIds: ['c', 'a', 'b'] });
    expect(out).toMatchObject({
      decision: 'split_pot',
      potCents: 82_000,
      shareCents: 27_333,
      leftoverCents: 1,
    });
  });
});

describe('payout', () => {
  it('can be recorded only after the winner is published, and is logged both ways', async () => {
    await seedWeek(db);
    await seedEntry(db, 'a', { wins: 10, payment: 'paid' });
    await expect(markPayout(db, { ...ref, sent: true })).rejects.toMatchObject({
      code: 'failed-precondition',
    });

    await enterResults(db, { ...ref, results: ALL_HOME, mnfTotal: 46 });
    await publishWinner(db, { ...ref, expectedPlayerIds: ['a'] });
    expect(await markPayout(db, { ...ref, sent: true })).toEqual({
      changed: true,
      payoutSent: true,
    });
    expect(await markPayout(db, { ...ref, sent: true })).toMatchObject({ changed: false });
    expect(await markPayout(db, { ...ref, sent: false })).toMatchObject({
      changed: true,
      payoutSent: false,
    });
    expect((await auditActions()).filter((a) => a === 'week.payout')).toHaveLength(2);
  });
});

describe('the payments queue list', () => {
  it('lists entries with payment, phone, and possible duplicates for the admin', async () => {
    await seedWeek(db, { status: 'open', lockInHours: 24 });
    await seedEntry(db, 'a', {
      name: 'Dale D.',
      phone: '+16135550123',
      payment: 'paid',
      method: 'etransfer',
    });
    await seedEntry(db, 'b', { name: 'Dale Douglas', phone: '+16135550123', payment: 'unpaid' });
    await seedEntry(db, 'c', { name: 'Jen K.', payment: null });

    const list = await listEntries(db, YEAR, WEEK);
    expect(list).toMatchObject({ weekNumber: 1, entryFeeCents: 2000 });
    const byId = Object.fromEntries(list!.rows.map((r) => [r.playerId, r]));
    expect(byId.a).toMatchObject({
      phone: '+16135550123',
      paymentStatus: 'paid',
      paymentMethod: 'etransfer',
    });
    expect(byId.c).toMatchObject({ paymentMethod: null, paymentStatus: 'unpaid' });
    expect(byId.a.duplicates).toEqual([
      { otherPlayerId: 'b', otherName: 'Dale Douglas', reasons: ['phone', 'similar_name'] },
    ]);
    expect(byId.c.duplicates).toEqual([]);
  });
});

describe('adminCorrectResults', () => {
  const correct = (
    results: unknown,
    mnfTotal: unknown,
    reason: unknown = 'Game 15 was entered the wrong way round',
  ) => correctResults(db, { ...ref, results, mnfTotal, reason });

  /** Dale leads with all-home picks. Jen took the away team on Monday night, so she wins if that game flips. */
  async function publishedWeek() {
    await seedWeek(db);
    await seedEntry(db, 'dale', { name: 'Dale D.', wins: 15, guess: 44, payment: 'paid' });
    await seedEntry(db, 'jen', { name: 'Jen K.', wins: 14, guess: 40, payment: 'paid' });
    await seedEntry(db, 'troy', { name: 'Troy T.', wins: 3, guess: 50, payment: 'unpaid' });
    await enterResults(db, { ...ref, results: ALL_HOME, mnfTotal: 44 });
    await publishWinner(db, { ...ref, expectedPlayerIds: ['dale'] });
    await markPayout(db, { ...ref, sent: true });
  }
  const FLIPPED = { ...ALL_HOME, mnf: 'away' };

  it('re-scores the week, replaces the winner, clears the payout, and leaves a public note', async () => {
    await publishedWeek();
    const published = (await db.doc(weekPath()).get()).get('winner').publishedAt.toMillis();

    // Jen had picked the away team on Monday night: she goes from 14 to 15, Dale from 15 to 14.
    const result = await correct(FLIPPED, 40);
    expect(result).toMatchObject({ changed: true, winnerChanged: true });
    expect(result.winner).toMatchObject({ playerIds: ['jen'], decision: 'most_wins' });
    expect(result.winner?.explanation).toMatch(/Jen K\. had the most correct picks/);

    const week = await db.doc(weekPath()).get();
    expect(week.get('status')).toBe('final');
    expect(week.get('results').mnf).toBe('away');
    expect(week.get('mnfTotal')).toBe(40);
    expect(week.get('winner')).toMatchObject({
      playerIds: ['jen'],
      displayNames: ['Jen K.'],
      potCents: 4000,
    });
    expect(week.get('winner').publishedAt.toMillis()).toBe(published); // first published then, corrected now
    expect(week.get('correctedAt').toMillis()).toBeGreaterThan(published);
    expect(week.get('payoutSent')).toBe(false);

    expect((await db.doc(`${weekPath()}/entries/dale`).get()).get('record')).toEqual({
      wins: 14,
      losses: 1,
    });
    expect((await db.doc(`${weekPath()}/entries/jen`).get()).get('record')).toEqual({
      wins: 15,
      losses: 0,
    });

    const log = (await db.collection('auditLog').orderBy('at').get()).docs.map((d) => d.data());
    const entry = log[log.length - 1];
    expect(entry).toMatchObject({
      action: 'week.correction',
      actorUid: ADMIN,
      reason: 'Game 15 was entered the wrong way round',
      before: { mnfTotal: 44, winner: { playerIds: ['dale'] }, payoutSent: true },
      after: {
        mnfTotal: 40,
        winner: { playerIds: ['jen'] },
        winnerChanged: true,
        payoutSent: false,
      },
    });
  });

  it('keeps the winner and the payout when the correction does not change who won', async () => {
    await publishedWeek();
    const result = await correct({ ...ALL_HOME, g01: 'away' }, 44);
    expect(result).toMatchObject({ changed: true, winnerChanged: false });
    const week = await db.doc(weekPath()).get();
    expect(week.get('winner').playerIds).toEqual(['dale']);
    expect(week.get('winner').record).toEqual({ wins: 14, losses: 1 });
    expect(week.get('payoutSent')).toBe(true);
    expect(week.get('correctedAt')).toBeTruthy();
  });

  it('writes nothing when the results are the same', async () => {
    await publishedWeek();
    const before = (await auditActions()).length;
    expect(await correct(ALL_HOME, 44)).toEqual({
      changed: false,
      winnerChanged: false,
      winner: null,
    });
    expect((await auditActions()).length).toBe(before);
    expect((await db.doc(weekPath()).get()).get('correctedAt')).toBeUndefined();
  });

  it('needs a reason, every result, and a week that is final', async () => {
    await publishedWeek();
    await expect(correct(FLIPPED, 40, '')).rejects.toThrow(/reason/);
    await expect(correct(FLIPPED, 40, null)).rejects.toThrow(/reason/);
    await expect(correct({ g01: 'home' }, 40)).rejects.toThrow(/all 15 results/);
    await expect(correct(FLIPPED, null)).rejects.toThrow(/Monday night total/);
    await expect(correct({ ...FLIPPED, g99: 'home' }, 40)).rejects.toThrow(/not a game/);
    expect((await db.doc(weekPath()).get()).get('winner').playerIds).toEqual(['dale']);

    await seedWeek(db, { status: 'locked' });
    await expect(correct(FLIPPED, 40)).rejects.toThrow(/published winner/);
  });
});
