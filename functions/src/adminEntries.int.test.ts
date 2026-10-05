/**
 * Admin entry, late entries, and removing an entry against the Firestore emulator (Sprint 4).
 * Run with `npm run test:rules` (it starts the emulator).
 */
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteEntry, upsertEntry } from './adminEntries';
import { listEntries } from './entriesList';
import { enterResults, publishWinner, setPayment } from './weekActions';
import {
  ALL_HOME,
  GAME_IDS,
  WEEK,
  YEAR,
  clearDb,
  picksWithWins,
  seedEntry,
  seedWeek,
  testDb,
  weekPath,
} from './testSupport.int';

const db = testDb();
const ADMIN = 'boss';
const ref = { year: YEAR, weekId: WEEK, actorUid: ADMIN };
const entryPath = (playerId: string) => `${weekPath()}/entries/${playerId}`;
const sheet = (overrides: Record<string, unknown> = {}) => ({
  source: 'paper',
  picks: picksWithWins(9),
  tiebreakerTotal: 41,
  ...overrides,
});

async function seedRosterPlayer(playerId: string, overrides: Record<string, unknown> = {}) {
  await db.doc(`players/${playerId}`).set({
    displayName: 'Rosalie M.',
    phone: null,
    email: null,
    claimedByUid: null,
    origin: 'admin',
    usualPayment: 'cash',
    active: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  });
}

const audit = async () =>
  (await db.collection('auditLog').orderBy('at').get()).docs.map((d) => d.data());

const enter = (playerId: string, entry: unknown, extra: Record<string, unknown> = {}) =>
  upsertEntry(db, { ...ref, playerId, entry, late: false, nowMs: Date.now(), ...extra });

beforeEach(async () => {
  await clearDb();
});

describe('adminUpsertEntry', () => {
  it('enters a paper sheet for a roster player and marks it paid in the same save', async () => {
    await seedWeek(db, { status: 'open', lockInHours: 24 });
    await seedRosterPlayer('rosalie');

    const result = await enter('rosalie', sheet({ markPaid: 'cash' }));
    expect(result).toMatchObject({ created: true, late: false, paid: true });
    expect(result.picksSubmittedAtMs).toBeGreaterThan(0);

    const entry = await db.doc(entryPath('rosalie')).get();
    expect(entry.data()).toMatchObject({
      playerId: 'rosalie',
      displayName: 'Rosalie M.',
      enteredBy: 'admin',
      source: 'paper',
      paperPhotoPath: null,
      lateOverride: null,
    });
    const picks = await db.doc(`${entryPath('rosalie')}/private/picks`).get();
    expect(picks.get('picks')).toEqual(picksWithWins(9));
    expect(picks.get('tiebreakerTotal')).toBe(41);
    const payment = await db.doc(`${entryPath('rosalie')}/payment/current`).get();
    expect(payment.data()).toMatchObject({
      paymentMethod: 'cash',
      paymentIntent: 'already_did',
      paymentStatus: 'paid',
      paidBy: ADMIN,
    });

    const log = await audit();
    expect(log.map((a) => a.action).sort()).toEqual(['entry.adminUpsert', 'payment.set']);
    const upsert = log.find((a) => a.action === 'entry.adminUpsert')!;
    expect(upsert).toMatchObject({ actorUid: ADMIN, before: null, year: YEAR, weekId: WEEK });
    expect(upsert.after).toMatchObject({ source: 'paper', tiebreakerTotal: 41 });
    expect(upsert.reason).toBeUndefined();
  });

  it('keeps a blank on the sheet as a blank, and keeps the photo path', async () => {
    await seedWeek(db, { status: 'open', lockInHours: 24 });
    await seedRosterPlayer('rosalie');
    const photo = `paperSheets/${YEAR}/${WEEK}/rosalie-1.jpg`;
    await enter('rosalie', sheet({ picks: { g01: 'home', mnf: 'away' }, paperPhotoPath: photo }));

    expect((await db.doc(entryPath('rosalie')).get()).get('paperPhotoPath')).toBe(photo);
    expect((await db.doc(`${entryPath('rosalie')}/private/picks`).get()).get('picks')).toEqual({
      g01: 'home',
      mnf: 'away',
    });
    expect((await db.doc(`${entryPath('rosalie')}/payment/current`).get()).exists).toBe(false);
  });

  it("edits an existing entry in place, including a player's own web entry", async () => {
    await seedWeek(db, { status: 'open', lockInHours: 24 });
    await seedEntry(db, 'dale', { name: 'Dale D.', wins: 4, guess: 30, payment: 'unpaid' });

    const result = await enter('dale', sheet({ source: 'text', tiebreakerTotal: 52 }));
    expect(result).toMatchObject({ created: false, paid: false });

    const entry = await db.doc(entryPath('dale')).get();
    expect(entry.get('enteredBy')).toBe('self'); // who first entered it does not change
    expect(entry.get('source')).toBe('text');
    expect((await db.collection(`${weekPath()}/entries`).get()).size).toBe(1);
    const log = await audit();
    expect(log[0].before).toMatchObject({ source: 'web', tiebreakerTotal: 30 });
    expect(log[0].after).toMatchObject({ source: 'text', tiebreakerTotal: 52 });
    // The player's own payment choice is left alone when no money changes hands.
    expect((await db.doc(`${entryPath('dale')}/payment/current`).get()).get('paymentStatus')).toBe(
      'unpaid',
    );
  });

  it('refuses once the lock time has passed, by the clock it is given, even if the week still says open', async () => {
    await seedWeek(db, { status: 'open', lockInHours: 1 });
    await seedRosterPlayer('rosalie');
    await expect(enter('rosalie', sheet(), { nowMs: Date.now() + 2 * 3_600_000 })).rejects.toThrow(
      /Picks are locked/,
    );
    expect((await db.doc(entryPath('rosalie')).get()).exists).toBe(false);
    expect(await audit()).toEqual([]);
  });

  it('refuses a draft week, a final week, an unknown player, an inactive player, and a bad sheet', async () => {
    await seedRosterPlayer('rosalie');
    await seedRosterPlayer('gone', { active: false });
    await seedRosterPlayer('merged', { mergedInto: 'rosalie' });

    await seedWeek(db, { status: 'draft', lockInHours: 24 });
    await expect(enter('rosalie', sheet())).rejects.toThrow(/isn't open yet/);
    await seedWeek(db, { status: 'final', lockInHours: -24 });
    await expect(enter('rosalie', sheet())).rejects.toThrow(/winner is published/);

    await seedWeek(db, { status: 'open', lockInHours: 24 });
    await expect(enter('nobody', sheet())).rejects.toThrow(/isn't on the roster/);
    await expect(enter('gone', sheet())).rejects.toThrow(/inactive/);
    await expect(enter('merged', sheet())).rejects.toThrow(/merged/);
    await expect(enter('rosalie', sheet({ tiebreakerTotal: 500 }))).rejects.toThrow(/tiebreaker/);
    await expect(enter('rosalie', sheet({ picks: { g99: 'home' } }))).rejects.toThrow(/sheet/);
    await expect(enter('rosalie', null)).rejects.toThrow();
    expect((await db.collection(`${weekPath()}/entries`).get()).size).toBe(0);
    expect(await audit()).toEqual([]);
  });

  it('shows up in the payments queue with its source and who entered it', async () => {
    await seedWeek(db, { status: 'open', lockInHours: 24 });
    await seedRosterPlayer('rosalie', { phone: '+16135550144' });
    await enter('rosalie', sheet({ markPaid: 'cash' }));
    const list = await listEntries(db, YEAR, WEEK);
    expect(list?.rows[0]).toMatchObject({
      playerId: 'rosalie',
      source: 'paper',
      enteredBy: 'admin',
      hasPaperPhoto: false,
      paymentStatus: 'paid',
      phone: '+16135550144',
    });
  });
});

describe('adminLateOverride', () => {
  const late = (playerId: string, entry: unknown, reason: unknown) =>
    upsertEntry(db, { ...ref, playerId, entry, late: true, reason, nowMs: Date.now() });

  it('needs a typed reason, and leaves a badge and an audit entry', async () => {
    await seedWeek(db, { status: 'locked', lockInHours: -2 });
    await seedRosterPlayer('rosalie');

    await expect(late('rosalie', sheet(), '')).rejects.toThrow(/reason/);
    await expect(late('rosalie', sheet(), null)).rejects.toThrow(/reason/);
    expect((await db.doc(entryPath('rosalie')).get()).exists).toBe(false);

    const result = await late('rosalie', sheet(), ' Sheet was in the drop box on Friday ');
    expect(result).toMatchObject({ created: true, late: true });
    const entry = await db.doc(entryPath('rosalie')).get();
    expect(entry.get('lateOverride')).toMatchObject({
      reason: 'Sheet was in the drop box on Friday',
      by: ADMIN,
    });
    expect(entry.get('lateOverride').at.toMillis()).toBeGreaterThan(0);

    const log = await audit();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      action: 'entry.lateOverride',
      actorUid: ADMIN,
      reason: 'Sheet was in the drop box on Friday',
    });
    expect((await listEntries(db, YEAR, WEEK))?.rows[0].lateOverride).toBe(true);
  });

  it('is refused while picks are still open, and once the winner is published', async () => {
    await seedRosterPlayer('rosalie');
    await seedWeek(db, { status: 'open', lockInHours: 24 });
    await expect(late('rosalie', sheet(), 'Dropped off late')).rejects.toThrow(/haven't locked/);

    await seedWeek(db, { status: 'locked', lockInHours: -2 });
    await seedEntry(db, 'dale', { wins: 12, payment: 'paid' });
    await enterResults(db, { ...ref, results: ALL_HOME, mnfTotal: 44 });
    await publishWinner(db, { ...ref, expectedPlayerIds: ['dale'] });
    await expect(late('rosalie', sheet(), 'Dropped off late')).rejects.toThrow(
      /winner is published/,
    );
  });

  it('gives the late entry its record when results are already in', async () => {
    await seedWeek(db, { status: 'locked', lockInHours: -2 });
    await seedRosterPlayer('rosalie');
    await enterResults(db, { ...ref, results: ALL_HOME, mnfTotal: 44 });
    await late('rosalie', sheet(), 'Sheet was in the drop box on Friday');
    expect((await db.doc(entryPath('rosalie')).get()).get('record')).toEqual({
      wins: 9,
      losses: GAME_IDS.length - 9,
    });
  });

  it('badges an existing entry that is changed after the lock', async () => {
    await seedWeek(db, { status: 'locked', lockInHours: -2 });
    await seedEntry(db, 'dale', { wins: 4, payment: 'paid' });
    await late('dale', sheet({ source: 'web' }), 'Game 3 was typed in wrong from his text');
    const entry = await db.doc(entryPath('dale')).get();
    expect(entry.get('lateOverride').reason).toBe('Game 3 was typed in wrong from his text');
    expect((await audit())[0].before).toMatchObject({ lateOverride: false });
  });
});

describe('adminDeleteEntry', () => {
  const remove = (playerId: string, reason: unknown) =>
    deleteEntry(db, { ...ref, playerId, reason });

  it('removes the entry, its picks, and its payment record, with a reason in the audit log', async () => {
    await seedWeek(db, { status: 'open', lockInHours: 24 });
    await seedEntry(db, 'dale', { name: 'Dale D.', wins: 4, guess: 30, payment: 'unpaid' });

    await expect(remove('dale', '')).rejects.toThrow(/reason/);
    expect(await remove('dale', 'Entered twice by mistake')).toEqual({ deleted: true });

    for (const path of ['', '/private/picks', '/payment/current']) {
      expect((await db.doc(`${entryPath('dale')}${path}`).get()).exists).toBe(false);
    }
    expect((await db.doc('players/dale').get()).exists).toBe(true); // the roster profile stays
    const log = await audit();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      action: 'entry.delete',
      reason: 'Entered twice by mistake',
      after: null,
    });
    expect(log[0].before).toMatchObject({
      displayName: 'Dale D.',
      tiebreakerTotal: 30,
      payment: { paymentStatus: 'unpaid' },
    });
  });

  it('will not remove a paid entry until the payment is undone', async () => {
    await seedWeek(db, { status: 'open', lockInHours: 24 });
    await seedEntry(db, 'dale', { payment: 'paid' });
    await expect(remove('dale', 'Entered twice by mistake')).rejects.toThrow(/Undo the payment/);
    await setPayment(db, { ...ref, playerId: 'dale', status: 'unpaid' });
    await expect(remove('dale', 'Entered twice by mistake')).resolves.toEqual({ deleted: true });
  });

  it('refuses a missing entry and a published week', async () => {
    await seedWeek(db, { status: 'open', lockInHours: 24 });
    await expect(remove('nobody', 'Entered twice by mistake')).rejects.toThrow(/no entry/);
    await seedWeek(db, { status: 'final', lockInHours: -24 });
    await seedEntry(db, 'dale', { payment: 'unpaid' });
    await expect(remove('dale', 'Entered twice by mistake')).rejects.toThrow(/winner is published/);
  });
});
