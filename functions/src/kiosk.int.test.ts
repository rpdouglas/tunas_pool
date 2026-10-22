import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  listKioskRoster,
  registerKioskPlayer,
  resetKioskPinByStaff,
  setKioskPin,
  submitKioskEntry,
  verifyKioskPin,
} from './kiosk';
import { YEAR, clearDb, picksWithWins, seedWeek, testDb } from './testSupport.int';

const db = testDb();
const WEEK = 'wk01';

describe('kiosk callables (D-142)', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('lists active players on the kiosk roster without exposing PII', async () => {
    await db.doc('players/p1').set({
      displayName: 'Dale D.',
      phone: '+16135550100',
      email: 'dale@private.test',
      active: true,
      createdAt: Timestamp.now(),
    });
    await db.doc('players/p2').set({
      displayName: 'Rosalie M.',
      phone: '+16135550101',
      email: 'rosalie@private.test',
      active: false, // inactive: should be omitted
      createdAt: Timestamp.now(),
    });

    const roster = await listKioskRoster(db);
    expect(roster).toHaveLength(1);
    expect(roster[0]).toEqual({
      playerId: 'p1',
      displayName: 'Dale D.',
      hasPin: false,
    });
    // Ensure no phone or email is present in the returned object
    expect(((roster[0] as unknown) as Record<string, unknown>).phone).toBeUndefined();
    expect(((roster[0] as unknown) as Record<string, unknown>).email).toBeUndefined();
  });

  it('registers a walk-in player and sets their initial PIN', async () => {
    const res = await registerKioskPlayer(db, {
      displayName: 'New Walkin',
      phoneOrEmail: '613-555-0199',
      pin: '1234',
      actorUid: 'kiosk-device',
    });

    expect(res.displayName).toBe('New Walkin');
    expect(res.playerId).toBeTruthy();

    const doc = await db.doc(`players/${res.playerId}`).get();
    expect(doc.exists).toBe(true);
    expect(doc.get('phone')).toBe('+16135550199');
    expect(doc.get('origin')).toBe('kiosk');
    expect(doc.get('kioskPinHash')).toBeTruthy();

    // Verification succeeds
    const verify = await verifyKioskPin(db, { playerId: res.playerId, pin: '1234' });
    expect(verify.valid).toBe(true);
  });

  it('sets and updates PIN, and locks out after 5 failed attempts', async () => {
    await db.doc('players/p1').set({
      displayName: 'Dale D.',
      active: true,
      createdAt: Timestamp.now(),
    });

    // Initial check indicates PIN needs setup
    const initial = await verifyKioskPin(db, { playerId: 'p1', pin: '0000' });
    expect(initial.needsPinSetup).toBe(true);

    // Set PIN
    await setKioskPin(db, {
      playerId: 'p1',
      currentPin: null,
      newPin: '9999',
      actorUid: 'kiosk',
    });

    // Check wrong pin
    const fail1 = await verifyKioskPin(db, { playerId: 'p1', pin: '1111' });
    expect(fail1.valid).toBe(false);
    expect(fail1.remainingAttempts).toBe(4);

    // 4 more failures lead to lockout
    await verifyKioskPin(db, { playerId: 'p1', pin: '1111' });
    await verifyKioskPin(db, { playerId: 'p1', pin: '1111' });
    await verifyKioskPin(db, { playerId: 'p1', pin: '1111' });
    const locked = await verifyKioskPin(db, { playerId: 'p1', pin: '1111' });
    expect(locked.valid).toBe(false);
    expect(locked.locked).toBe(true);

    // Staff reset clears the PIN and lockout
    await resetKioskPinByStaff(db, {
      playerId: 'p1',
      actorUid: 'devon-staff',
      actorRole: 'counter',
    });

    const resetCheck = await verifyKioskPin(db, { playerId: 'p1', pin: '9999' });
    expect(resetCheck.needsPinSetup).toBe(true);
  });

  it('submits picks before lock time and saves private picks + payment intent', async () => {
    await seedWeek(db, { weekId: WEEK, status: 'open', lockInHours: 2 });

    const registered = await registerKioskPlayer(db, {
      displayName: 'Player One',
      phoneOrEmail: 'player@test.com',
      pin: '5555',
      actorUid: 'kiosk',
    });

    const picks = picksWithWins(10);
    const result = await submitKioskEntry(db, {
      year: YEAR,
      weekId: WEEK,
      playerId: registered.playerId,
      pin: '5555',
      picks,
      tiebreakerTotal: 45,
      paymentMethod: 'cash',
      paymentIntent: 'will_do',
      actorUid: 'kiosk',
      nowMs: Date.now(),
    });

    expect(result.playerId).toBe(registered.playerId);

    // Check entry doc
    const entryDoc = await db.doc(`seasons/${YEAR}/weeks/${WEEK}/entries/${registered.playerId}`).get();
    expect(entryDoc.exists).toBe(true);
    expect(entryDoc.get('source')).toBe('kiosk');
    expect(entryDoc.get('enteredBy')).toBe('kiosk');

    // Check picks
    const picksDoc = await db.doc(`seasons/${YEAR}/weeks/${WEEK}/entries/${registered.playerId}/private/picks`).get();
    expect(picksDoc.exists).toBe(true);
    expect(picksDoc.get('tiebreakerTotal')).toBe(45);

    // Check payment
    const paymentDoc = await db.doc(`seasons/${YEAR}/weeks/${WEEK}/entries/${registered.playerId}/payment/current`).get();
    expect(paymentDoc.exists).toBe(true);
    expect(paymentDoc.get('paymentMethod')).toBe('cash');
    expect(paymentDoc.get('paymentStatus')).toBe('unpaid');
  });

  it('strictly refuses entry submission after the week lock time', async () => {
    await seedWeek(db, { weekId: WEEK, status: 'open', lockInHours: -1 });

    const registered = await registerKioskPlayer(db, {
      displayName: 'Late Player',
      phoneOrEmail: 'late@test.com',
      pin: '7777',
      actorUid: 'kiosk',
    });

    await expect(
      submitKioskEntry(db, {
        year: YEAR,
        weekId: WEEK,
        playerId: registered.playerId,
        pin: '7777',
        picks: picksWithWins(5),
        tiebreakerTotal: 30,
        paymentMethod: 'cash',
        paymentIntent: 'will_do',
        actorUid: 'kiosk',
        nowMs: Date.now(),
      }),
    ).rejects.toThrow(/Picks are locked for this week/);
  });
});
