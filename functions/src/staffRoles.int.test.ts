/**
 * Staff roles from the roster against the Firestore emulator (D-140). Run with `npm run test:rules`.
 * Auth is a stand-in: the claims live on logins, which the Firestore emulator doesn't hold.
 */
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { listStaffRoles, setStaffRole, type RoleAuth } from './staffRoles';
import { clearDb, testDb } from './testSupport.int';

const db = testDb();
const RYAN = 'ryan-uid';

interface FakeUser {
  customClaims?: Record<string, unknown>;
  providerData: unknown[];
}

function fakeAuth(users: Record<string, FakeUser>): RoleAuth & { sets: number } {
  const auth = {
    sets: 0,
    async getUser(uid: string) {
      const user = users[uid];
      if (!user) throw new Error('auth/user-not-found');
      return user;
    },
    async getUsers(ids: { uid: string }[]) {
      return {
        users: ids.filter(({ uid }) => users[uid]).map(({ uid }) => ({ uid, ...users[uid] })),
      };
    },
    async setCustomUserClaims(uid: string, claims: Record<string, unknown> | null) {
      auth.sets += 1;
      users[uid] = { ...users[uid], customClaims: claims ?? undefined };
    },
  };
  return auth;
}

const saved = (customClaims?: Record<string, unknown>): FakeUser => ({
  customClaims,
  providerData: [{ providerId: 'google.com' }],
});

async function seedPlayer(playerId: string, overrides: Record<string, unknown> = {}) {
  await db.doc(`players/${playerId}`).set({
    displayName: playerId === 'devon' ? 'Devon' : 'Rosalie M.',
    phone: null,
    email: null,
    claimedByUid: null,
    origin: 'admin',
    active: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  });
}

const roleLog = async () =>
  (await db.collection('auditLog').where('action', '==', 'player.role').get()).docs.map((d) =>
    d.data(),
  );

describe('staff roles from the roster', () => {
  beforeEach(clearDb);

  it('makes a linked player a counter, then an admin, then a player again, each in the log', async () => {
    await seedPlayer('devon', { claimedByUid: 'devon-uid' });
    const users = { 'devon-uid': saved({ lilypadEditor: true }) };
    const auth = fakeAuth(users);
    const set = (role: 'admin' | 'counter' | 'none') =>
      setStaffRole(db, auth, { playerId: 'devon', role, actorUid: RYAN });

    expect(await set('counter')).toEqual({ role: 'counter', changed: true });
    expect(users['devon-uid'].customClaims).toEqual({ lilypadEditor: true, counter: true });
    expect(await listStaffRoles(db, auth)).toEqual({ roles: { devon: 'counter' } });

    expect(await set('admin')).toEqual({ role: 'admin', changed: true });
    expect(users['devon-uid'].customClaims).toEqual({ lilypadEditor: true, admin: true });

    expect(await set('none')).toEqual({ role: 'none', changed: true });
    // Another app's claim on the shared project stays (D-015).
    expect(users['devon-uid'].customClaims).toEqual({ lilypadEditor: true });
    expect(await listStaffRoles(db, auth)).toEqual({ roles: {} });

    const log = await roleLog();
    expect(log).toHaveLength(3);
    expect(log.map((e) => [e.before.role, e.after.role]).sort()).toEqual(
      [
        ['none', 'counter'],
        ['counter', 'admin'],
        ['admin', 'none'],
      ].sort(),
    );
    expect(log[0]).toMatchObject({ actorUid: RYAN, target: 'players/devon' });
  });

  it('does nothing when the player already has that role', async () => {
    await seedPlayer('devon', { claimedByUid: 'devon-uid' });
    const auth = fakeAuth({ 'devon-uid': saved({ counter: true }) });
    expect(
      await setStaffRole(db, auth, { playerId: 'devon', role: 'counter', actorUid: RYAN }),
    ).toEqual({ role: 'counter', changed: false });
    expect(auth.sets).toBe(0);
    expect(await roleLog()).toHaveLength(0);
  });

  it('refuses a player with no login, a guest login, a merged profile, and your own', async () => {
    await seedPlayer('rosalie');
    await seedPlayer('guest', { claimedByUid: 'guest-uid', origin: 'self' });
    await seedPlayer('old', { claimedByUid: 'old-uid', mergedInto: 'devon' });
    await seedPlayer('devon', { claimedByUid: RYAN });
    const auth = fakeAuth({
      'guest-uid': { providerData: [] },
      'old-uid': saved(),
      [RYAN]: saved({ admin: true }),
    });
    const set = (playerId: string) =>
      setStaffRole(db, auth, { playerId, role: 'admin', actorUid: RYAN });

    await expect(set('rosalie')).rejects.toThrow(/isn't linked to a login/);
    await expect(set('guest')).rejects.toThrow(/signed in as a guest/);
    await expect(set('old')).rejects.toThrow(/merged into another player/);
    await expect(set('devon')).rejects.toThrow(/can't change your own role/);
    await expect(set('nobody')).rejects.toThrow(/does not exist/);
    expect(auth.sets).toBe(0);
    expect(await roleLog()).toHaveLength(0);
  });

  it('says so when the linked login is gone', async () => {
    await seedPlayer('devon', { claimedByUid: 'deleted-uid' });
    await expect(
      setStaffRole(db, fakeAuth({}), { playerId: 'devon', role: 'counter', actorUid: RYAN }),
    ).rejects.toThrow(/no longer exists/);
  });
});
