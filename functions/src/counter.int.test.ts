/**
 * The counter role (Devon, D-095) against the Firestore emulator. Run with `npm run test:rules`.
 * Devon enters a new sheet while the week is open, marks cash received, adds and fixes roster
 * players, and sees nothing private. Everything else is refused with "Ask the commissioner".
 */
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { upsertEntry } from './adminEntries';
import { loadCounterOverview, saveCounterPlayer } from './counter';
import { setPayment } from './weekActions';
import { YEAR, clearDb, picksWithWins, seedWeek, testDb } from './testSupport.int';

const db = testDb();
const WEEK = 'wk01';
const ADMIN = { actorUid: 'boss' };
const DEVON = {
  actorUid: 'devon-uid',
  actorRole: 'counter' as const,
  actorEmail: 'devon@shop.test',
};
const ref = { year: YEAR, weekId: WEEK };

async function seedPlayer(playerId: string, overrides: Record<string, unknown> = {}) {
  await db.doc(`players/${playerId}`).set({
    displayName: 'Rosalie M.',
    phone: '+16135550144',
    email: 'rosalie@private.test',
    notes: 'large-print sheet',
    claimedByUid: null,
    origin: 'admin',
    usualPayment: 'cash',
    active: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  });
}

const sheet = (markPaid: 'cash' | 'etransfer' | null = null) => ({
  source: 'paper',
  picks: picksWithWins(9),
  tiebreakerTotal: 41,
  markPaid,
});

const enter = (
  who: typeof ADMIN | typeof DEVON,
  playerId: string,
  markPaid = null as 'cash' | 'etransfer' | null,
) =>
  upsertEntry(db, {
    ...ref,
    ...who,
    playerId,
    entry: sheet(markPaid),
    late: false,
    nowMs: Date.now(),
  });

const pay = (
  who: typeof ADMIN | typeof DEVON,
  playerId: string,
  status: 'paid' | 'unpaid',
  method?: 'cash' | 'etransfer',
) => setPayment(db, { ...ref, ...who, playerId, status, method });

const exists = async (path: string) => (await db.doc(path).get()).exists;
const audits = async (action: string) =>
  (await db.collection('auditLog').where('action', '==', action).get()).docs.map((d) => d.data());

beforeEach(async () => {
  await clearDb();
  await seedWeek(db, { weekId: WEEK, status: 'open', lockInHours: 24 });
});

describe('the counter overview', () => {
  it('shows names and this week’s status, and nothing private', async () => {
    await seedPlayer('rosalie');
    await seedPlayer('walt', {
      displayName: 'Walt W.',
      phone: '+16135550999',
      notes: 'secret note',
    });
    await enter(ADMIN, 'rosalie', 'cash');

    const { rows } = await loadCounterOverview(db, { ...ref, role: 'counter' });
    expect(rows.map((r) => [r.displayName, r.entered, r.paymentStatus, r.paymentMethod])).toEqual([
      ['Rosalie M.', true, 'paid', 'cash'],
      ['Walt W.', false, null, null],
    ]);
    const json = JSON.stringify(rows);
    for (const secret of [
      '6135550144',
      '6135550999',
      'rosalie@private.test',
      'large-print',
      'secret note',
    ]) {
      expect(json).not.toContain(secret);
    }
    expect(Object.keys(rows[0]).sort()).toEqual([
      'active',
      'displayName',
      'entered',
      'late',
      'origin',
      'paymentMethod',
      'paymentStatus',
      'playerId',
      'source',
    ]);
  });

  it('leaves a merged profile out, and keeps an inactive one so Devon can see why they are missing', async () => {
    await seedPlayer('rosalie');
    await seedPlayer('old', { displayName: 'Old Timer', active: false });
    await seedPlayer('twin', { displayName: 'Rosalie M.', mergedInto: 'rosalie' });
    const { rows } = await loadCounterOverview(db, { ...ref, role: 'counter' });
    expect(rows.map((r) => r.playerId).sort()).toEqual(['old', 'rosalie']);
    expect(rows.find((r) => r.playerId === 'old')?.active).toBe(false);
  });

  it('keeps a draft week for the commissioner', async () => {
    await seedWeek(db, { weekId: 'wk02', status: 'draft' });
    await expect(
      loadCounterOverview(db, { year: YEAR, weekId: 'wk02', role: 'counter' }),
    ).rejects.toThrow(/Ask the commissioner/);
    await expect(
      loadCounterOverview(db, { year: YEAR, weekId: 'wk02', role: 'admin' }),
    ).resolves.toBeDefined();
  });
});

describe('entering picks as the counter', () => {
  it('saves a new sheet while the week is open, marks cash paid, and logs Devon by name', async () => {
    await seedPlayer('rosalie');
    const result = await enter(DEVON, 'rosalie', 'cash');
    expect(result).toMatchObject({ created: true, paid: true });

    expect(await exists(`seasons/${YEAR}/weeks/${WEEK}/entries/rosalie`)).toBe(true);
    const payment = (
      await db.doc(`seasons/${YEAR}/weeks/${WEEK}/entries/rosalie/payment/current`).get()
    ).data();
    expect(payment).toMatchObject({
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      paidBy: 'devon-uid',
    });

    for (const action of ['entry.adminUpsert', 'payment.set']) {
      const [log] = await audits(action);
      expect(log).toMatchObject({
        actorUid: 'devon-uid',
        actorRole: 'counter',
        actorEmail: 'devon@shop.test',
      });
    }
  });

  it('does not stamp the commissioner’s own actions as the counter’s', async () => {
    await seedPlayer('rosalie');
    await enter(ADMIN, 'rosalie', 'cash');
    const [log] = await audits('entry.adminUpsert');
    expect(log.actorRole).toBeUndefined();
    expect(log.actorEmail).toBeUndefined();
  });

  it('refuses to change a sheet that is already in, and the picks stay as they were', async () => {
    await seedPlayer('rosalie');
    await enter(ADMIN, 'rosalie');
    await expect(enter(DEVON, 'rosalie')).rejects.toThrow(
      "Rosalie M.'s sheet is already in. To change it, ask the commissioner.",
    );
    // The commissioner still can.
    await expect(enter(ADMIN, 'rosalie')).resolves.toMatchObject({ created: false });
  });

  it('refuses after the lock, and a late entry stays the commissioner’s', async () => {
    await seedPlayer('rosalie');
    await seedWeek(db, { weekId: WEEK, status: 'locked', lockInHours: -1 });
    await expect(enter(DEVON, 'rosalie')).rejects.toThrow(/Picks are locked.*Ask the commissioner/);
    expect(await exists(`seasons/${YEAR}/weeks/${WEEK}/entries/rosalie`)).toBe(false);
  });

  it('refuses to mark an e-Transfer paid, and writes nothing at all', async () => {
    await seedPlayer('rosalie');
    await expect(enter(DEVON, 'rosalie', 'etransfer')).rejects.toThrow(
      /confirmed by the commissioner/,
    );
    expect(await exists(`seasons/${YEAR}/weeks/${WEEK}/entries/rosalie`)).toBe(false);
    expect(await audits('entry.adminUpsert')).toHaveLength(0);
  });

  it('refuses an inactive player', async () => {
    await seedPlayer('old', { displayName: 'Old Timer', active: false });
    await expect(enter(DEVON, 'old')).rejects.toThrow(
      'Old Timer is marked inactive. Ask the commissioner.',
    );
  });
});

describe('payments as the counter', () => {
  beforeEach(async () => {
    await seedPlayer('rosalie');
    await enter(ADMIN, 'rosalie');
  });
  const paymentDoc = async () =>
    (await db.doc(`seasons/${YEAR}/weeks/${WEEK}/entries/rosalie/payment/current`).get()).data();

  it('marks cash received and can undo it', async () => {
    await expect(pay(DEVON, 'rosalie', 'paid', 'cash')).resolves.toMatchObject({ changed: true });
    expect(await paymentDoc()).toMatchObject({ paymentStatus: 'paid', paymentMethod: 'cash' });
    await expect(pay(DEVON, 'rosalie', 'unpaid')).resolves.toMatchObject({ changed: true });
    expect(await paymentDoc()).toMatchObject({ paymentStatus: 'unpaid' });
    const logs = await audits('payment.set');
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.actorRole === 'counter' && l.actorUid === 'devon-uid')).toBe(true);
  });

  it('refuses to mark an e-Transfer paid', async () => {
    await expect(pay(DEVON, 'rosalie', 'paid', 'etransfer')).rejects.toThrow(
      /confirmed by the commissioner/,
    );
    expect(await paymentDoc()).toBeUndefined();
  });

  it('refuses to undo an e-Transfer the commissioner confirmed, and leaves it paid', async () => {
    await pay(ADMIN, 'rosalie', 'paid', 'etransfer');
    await expect(pay(DEVON, 'rosalie', 'unpaid')).rejects.toThrow(/undo an e-Transfer payment/);
    expect(await paymentDoc()).toMatchObject({ paymentStatus: 'paid', paymentMethod: 'etransfer' });
    // The commissioner can.
    await expect(pay(ADMIN, 'rosalie', 'unpaid')).resolves.toMatchObject({ changed: true });
  });

  it('takes cash from someone who said they would e-Transfer', async () => {
    await db
      .doc(`seasons/${YEAR}/weeks/${WEEK}/entries/rosalie/payment/current`)
      .set({ paymentMethod: 'etransfer', paymentIntent: 'will_do', paymentStatus: 'unpaid' });
    await pay(DEVON, 'rosalie', 'paid', 'cash');
    expect(await paymentDoc()).toMatchObject({ paymentStatus: 'paid', paymentMethod: 'cash' });
  });
});

describe('adding and fixing roster players as the counter', () => {
  const save = (over: Record<string, unknown> = {}) =>
    saveCounterPlayer(db, {
      playerId: null,
      displayName: 'Walt W.',
      role: 'counter',
      actorUid: 'devon-uid',
      actorEmail: 'devon@shop.test',
      ...over,
    });

  it('adds a roster player with only what Devon typed, and logs it without the phone number', async () => {
    const result = await save({ phone: '613-555-0123', usualPayment: 'cash' });
    expect(result).toMatchObject({ saved: true, created: true });
    if (!result.saved) throw new Error('expected a save');
    const player = (await db.doc(`players/${result.playerId}`).get()).data()!;
    expect(player).toMatchObject({
      displayName: 'Walt W.',
      phone: '+16135550123',
      email: null,
      notes: null,
      claimedByUid: null,
      origin: 'admin',
      usualPayment: 'cash',
      active: true,
    });
    const [log] = await audits('player.saved');
    expect(log).toMatchObject({ actorRole: 'counter', actorEmail: 'devon@shop.test' });
    expect(JSON.stringify(log)).not.toContain('5550123');
  });

  it('asks before adding a possible double, and adds nothing until Devon says so', async () => {
    await seedPlayer('rosalie');
    const asked = await save({ displayName: 'Rosalie M.' });
    expect(asked).toMatchObject({
      saved: false,
      matches: [{ playerId: 'rosalie', displayName: 'Rosalie M.' }],
    });
    expect(JSON.stringify(asked)).not.toContain('6135550144');
    expect((await db.collection('players').get()).size).toBe(1);

    await expect(save({ displayName: 'Rosalie M.', force: true })).resolves.toMatchObject({
      saved: true,
      created: true,
    });
    expect((await db.collection('players').get()).size).toBe(2);
  });

  it('fixes a name without touching the stored phone, email, note, or Inactive setting', async () => {
    await seedPlayer('rosalie', { displayName: 'Rosalie', active: false });
    await expect(
      save({ playerId: 'rosalie', displayName: 'Rosalie M.', phone: '', usualPayment: null }),
    ).resolves.toMatchObject({ saved: true, created: false });
    const player = (await db.doc('players/rosalie').get()).data()!;
    expect(player).toMatchObject({
      displayName: 'Rosalie M.',
      phone: '+16135550144',
      email: 'rosalie@private.test',
      notes: 'large-print sheet',
      usualPayment: 'cash',
      active: false,
    });
  });

  it('can set a new phone number, or how they usually pay', async () => {
    await seedPlayer('rosalie');
    await save({
      playerId: 'rosalie',
      displayName: 'Rosalie M.',
      phone: '613-555-0777',
      usualPayment: 'etransfer',
    });
    expect((await db.doc('players/rosalie').get()).data()).toMatchObject({
      phone: '+16135550777',
      usualPayment: 'etransfer',
    });
  });

  it('leaves a player who signed up on the website to manage their own details', async () => {
    await seedPlayer('selfmade', { origin: 'self', claimedByUid: 'uid-2', displayName: 'Dale D.' });
    await expect(save({ playerId: 'selfmade', displayName: 'Dale Douglas' })).rejects.toThrow(
      /manages their own details/,
    );
    expect((await db.doc('players/selfmade').get()).data()?.displayName).toBe('Dale D.');
  });

  it('rejects a blank name and a phone that is not a number', async () => {
    await expect(save({ displayName: '   ' })).rejects.toThrow(/Enter the name/);
    await expect(save({ phone: '12' })).rejects.toThrow(/10-digit phone number/);
    expect((await db.collection('players').get()).size).toBe(0);
  });

  it('does not stamp the commissioner’s use of it as the counter’s', async () => {
    await save({ role: 'admin', actorUid: 'boss' });
    const [log] = await audits('player.saved');
    expect(log.actorRole).toBeUndefined();
  });
});
