/**
 * Deleting a player against the Firestore emulator (D-094). Run with `npm run test:rules`.
 * A player with no history goes; anyone with a week played, a login linked, or a request waiting
 * stays, and says why.
 */
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { upsertEntry } from './adminEntries';
import { deletePlayer, inspectPlayerDelete } from './players';
import { YEAR, clearDb, picksWithWins, seedWeek, testDb } from './testSupport.int';

const db = testDb();
const ADMIN = 'boss';

async function seedPlayer(playerId: string, overrides: Record<string, unknown> = {}) {
  await db.doc(`players/${playerId}`).set({
    displayName: 'Rosalie M.',
    phone: '+16135550144',
    email: null,
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

const remove = (playerId: string, reason: unknown = 'Added by mistake') =>
  deletePlayer(db, { playerId, reason, actorUid: ADMIN });

const exists = async (path: string) => (await db.doc(path).get()).exists;

describe('deleting a player', () => {
  beforeEach(clearDb);

  it('deletes a player with no history, takes their stats with them, and writes the audit entry', async () => {
    await seedPlayer('rosalie');
    await db.doc('players/rosalie/stats/allTime').set({ weeksPlayed: 0 });

    expect(await inspectPlayerDelete(db, 'rosalie')).toEqual({ ok: true });
    expect(await remove('rosalie')).toEqual({ deleted: true });

    expect(await exists('players/rosalie')).toBe(false);
    expect(await exists('players/rosalie/stats/allTime')).toBe(false);

    const log = await db.collection('auditLog').where('action', '==', 'player.delete').get();
    expect(log.size).toBe(1);
    const entry = log.docs[0].data();
    expect(entry).toMatchObject({
      actorUid: ADMIN,
      target: 'players/rosalie',
      reason: 'Added by mistake',
      after: null,
    });
    // The log says they existed, never who they were beyond the name: no phone, email, or note.
    expect(entry.before).toEqual({
      displayName: 'Rosalie M.',
      origin: 'admin',
      active: true,
      hadPhone: true,
      hadEmail: false,
      hadNote: true,
    });
    expect(JSON.stringify(entry)).not.toContain('6135550144');
    expect(JSON.stringify(entry)).not.toContain('large-print');
  });

  it('needs a reason, and changes nothing without one', async () => {
    await seedPlayer('rosalie');
    await expect(remove('rosalie', '  ')).rejects.toThrow(/short reason/);
    expect(await exists('players/rosalie')).toBe(true);
    expect((await db.collection('auditLog').get()).size).toBe(0);
  });

  it('says a player who does not exist is not found', async () => {
    await expect(remove('nobody')).rejects.toThrow(/does not exist/);
    await expect(inspectPlayerDelete(db, 'nobody')).rejects.toThrow(/does not exist/);
  });

  it('refuses a player who has played a week, and points to Inactive or a merge', async () => {
    await seedPlayer('rosalie');
    await seedWeek(db, { weekId: 'wk01', status: 'open', lockInHours: 24 });
    await upsertEntry(db, {
      year: YEAR,
      weekId: 'wk01',
      playerId: 'rosalie',
      actorUid: ADMIN,
      late: false,
      nowMs: Date.now(),
      entry: { source: 'paper', picks: picksWithWins(9), tiebreakerTotal: 41, markPaid: null },
    });

    const check = await inspectPlayerDelete(db, 'rosalie');
    expect(check).toMatchObject({ ok: false, code: 'played' });
    await expect(remove('rosalie')).rejects.toThrow(/Inactive/);
    expect(await exists('players/rosalie')).toBe(true);
    expect(await exists(`seasons/${YEAR}/weeks/wk01/entries/rosalie`)).toBe(true);
    expect(
      (await db.collection('auditLog').where('action', '==', 'player.delete').get()).size,
    ).toBe(0);
  });

  it('allows it again once the only entry has been removed (so the order is: remove the entry, then the player)', async () => {
    await seedPlayer('rosalie');
    await seedWeek(db, { weekId: 'wk01', status: 'open', lockInHours: 24 });
    await db.doc(`seasons/${YEAR}/weeks/wk01/entries/rosalie`).set({ displayName: 'Rosalie M.' });
    expect(await inspectPlayerDelete(db, 'rosalie')).toMatchObject({ ok: false, code: 'played' });
    await db.doc(`seasons/${YEAR}/weeks/wk01/entries/rosalie`).delete();
    expect(await inspectPlayerDelete(db, 'rosalie')).toEqual({ ok: true });
  });

  it('refuses a player with a login linked, whether the admin or the player made the profile', async () => {
    await seedPlayer('approved', { claimedByUid: 'uid-1', origin: 'admin' });
    await seedPlayer('selfmade', { claimedByUid: 'uid-2', origin: 'self' });
    await expect(remove('approved')).rejects.toThrow(/Unlink the login/);
    await expect(remove('selfmade')).rejects.toThrow(/own login/);
    expect(await exists('players/approved')).toBe(true);
    expect(await exists('players/selfmade')).toBe(true);
  });

  it('refuses while a request to link a login is waiting on this player', async () => {
    await seedPlayer('rosalie');
    await db.collection('claims').add({
      requesterUid: 'uid-9',
      requesterEmail: 'kid@family.test',
      claimedName: 'Rosalie',
      claimedPhone: null,
      status: 'pending',
      suggestedPlayerId: 'rosalie',
      resolvedPlayerId: null,
      createdAt: Timestamp.now(),
    });
    expect(await inspectPlayerDelete(db, 'rosalie')).toMatchObject({
      ok: false,
      code: 'pending_claim',
    });
    await expect(remove('rosalie')).rejects.toThrow(/Claims/);
  });

  it('ignores a request that is already decided', async () => {
    await seedPlayer('rosalie');
    await db.collection('claims').add({
      requesterUid: 'uid-9',
      requesterEmail: null,
      claimedName: 'Rosalie',
      claimedPhone: null,
      status: 'rejected',
      suggestedPlayerId: 'rosalie',
      resolvedPlayerId: null,
      createdAt: Timestamp.now(),
    });
    expect(await inspectPlayerDelete(db, 'rosalie')).toEqual({ ok: true });
  });

  it('says a merged profile needs no deleting', async () => {
    await seedPlayer('old', { mergedInto: 'rosalie' });
    expect(await inspectPlayerDelete(db, 'old')).toMatchObject({ ok: false, code: 'merged' });
  });
});
