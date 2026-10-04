/**
 * Starter subset of the test matrix in docs/FIRESTORE_RULES.md §5.
 * Run with: npm run test:rules   (starts the Firestore emulator, needs Java)
 * Matrix row numbers are noted in each test name. Add the remaining rows in Sprint 1.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { Timestamp, doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-tunas-pool';
const YEAR = '2026';
const OPEN_WEEK = 'wk04'; // open, lockAt in the future
const LOCKED_WEEK = 'wk03'; // locked, lockAt in the past
const REVEALED_WEEK = 'wk02'; // locked + revealed

const hoursFromNow = (h: number) => Timestamp.fromMillis(Date.now() + h * 60 * 60 * 1000);
const weekPath = (w: string) => `seasons/${YEAR}/weeks/${w}`;

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const baseWeek = { games: [], results: {}, mnfTotal: null, winner: null, payoutSent: false };
    await setDoc(doc(db, weekPath(OPEN_WEEK)), {
      ...baseWeek, status: 'open', lockAt: hoursFromNow(24), revealed: false,
    });
    await setDoc(doc(db, weekPath(LOCKED_WEEK)), {
      ...baseWeek, status: 'locked', lockAt: hoursFromNow(-24), revealed: false,
    });
    await setDoc(doc(db, weekPath(REVEALED_WEEK)), {
      ...baseWeek, status: 'locked', lockAt: hoursFromNow(-48), revealed: true,
    });
    // Roster/self profile p1 is owned by alice
    await setDoc(doc(db, 'players/p1'), {
      displayName: 'Alice A.', phone: '+16135550101', email: null, claimedByUid: 'alice',
      origin: 'self', usualPayment: null, active: true,
      createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    });
    // An entry with private picks, in the open week and the revealed week
    for (const w of [OPEN_WEEK, REVEALED_WEEK]) {
      await setDoc(doc(db, `${weekPath(w)}/entries/p1`), entryData('p1'));
      await setDoc(doc(db, `${weekPath(w)}/entries/p1/private/picks`), {
        picks: { g01: 'home' }, tiebreakerTotal: 45, updatedAt: Timestamp.now(),
      });
    }
  });
});

function entryData(playerId: string, overrides: Record<string, unknown> = {}) {
  return {
    playerId,
    displayName: 'Alice A.',
    paymentMethod: 'etransfer',
    paymentIntent: 'will_do',
    paymentStatus: 'unpaid',
    enteredBy: 'self',
    source: 'web',
    paperPhotoPath: null,
    lateOverride: null,
    picksSubmittedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  };
}

describe('players', () => {
  it('#1 a guest can create their own profile (playerId == uid)', async () => {
    const db = env.authenticatedContext('carol').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'players/carol'), {
        displayName: 'Carol C.', phone: null, email: null, claimedByUid: 'carol',
        origin: 'self', usualPayment: null, active: true,
        createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      }),
    );
  });

  it("#2 a guest cannot create someone else's profile", async () => {
    const db = env.authenticatedContext('carol').firestore();
    await assertFails(
      setDoc(doc(db, 'players/dave'), {
        displayName: 'Dave D.', phone: null, email: null, claimedByUid: 'carol',
        origin: 'self', usualPayment: null, active: true,
        createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      }),
    );
  });

  it('#4 the owner cannot change claimedByUid', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'players/p1'), { claimedByUid: 'mallory' }, { merge: true }));
  });

  it('#5 only the owner (or admin) can read a profile', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('alice').firestore(), 'players/p1')));
    await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(), 'players/p1')));
  });
});

describe('entries and the lockout', () => {
  it('#9 the owner can create an entry while the week is open', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `players/p2`), {
        displayName: 'Bob B.', phone: null, email: null, claimedByUid: 'bob',
        origin: 'self', usualPayment: null, active: true,
        createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      });
    });
    const db = env.authenticatedContext('bob').firestore();
    await assertSucceeds(setDoc(doc(db, `${weekPath(OPEN_WEEK)}/entries/p2`), entryData('p2', { displayName: 'Bob B.' })));
  });

  it('#10 the owner cannot create an entry after lockAt', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `players/p2`), {
        displayName: 'Bob B.', phone: null, email: null, claimedByUid: 'bob',
        origin: 'self', usualPayment: null, active: true,
        createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      });
    });
    const db = env.authenticatedContext('bob').firestore();
    await assertFails(setDoc(doc(db, `${weekPath(LOCKED_WEEK)}/entries/p2`), entryData('p2', { displayName: 'Bob B.' })));
  });

  it("#12 the owner cannot mark their own entry paid", async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(
      setDoc(doc(db, `${weekPath(OPEN_WEEK)}/entries/p1`), entryData('p1', { paymentStatus: 'paid' })),
    );
  });

  it('#17 the owner cannot write picks after lock', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(
      setDoc(doc(db, `${weekPath(LOCKED_WEEK)}/entries/p1/private/picks`), {
        picks: { g01: 'away' }, tiebreakerTotal: 40, updatedAt: Timestamp.now(),
      }),
    );
  });
});

describe('hidden picks', () => {
  const picksPath = (w: string) => `${weekPath(w)}/entries/p1/private/picks`;

  it('#20 other players cannot read picks before reveal', async () => {
    await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(), picksPath(OPEN_WEEK))));
  });

  it('#21 other players can read picks once the week is revealed', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('bob').firestore(), picksPath(REVEALED_WEEK))));
  });

  it('#22 the owner and admin can read picks before reveal', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('alice').firestore(), picksPath(OPEN_WEEK))));
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext('boss', { admin: true }).firestore(), picksPath(OPEN_WEEK))),
    );
  });
});

describe('locked-down collections', () => {
  it('#23 clients cannot write claims directly', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'claims/c1'), { requesterUid: 'alice', status: 'pending' }));
  });

  it('#25 clients cannot write auditLog or standings', async () => {
    const db = env.authenticatedContext('boss', { admin: true }).firestore();
    await assertFails(setDoc(doc(db, 'auditLog/a1'), { action: 'payment.set' }));
    await assertFails(setDoc(doc(db, `seasons/${YEAR}/standings/p1`), { wins: 99 }));
  });

  it('#26 admin can read the audit log; players cannot', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('boss', { admin: true }).firestore(), 'auditLog/a1')));
    await assertFails(getDoc(doc(env.authenticatedContext('alice').firestore(), 'auditLog/a1')));
  });

  it('#31 unauthenticated users cannot read or write anything', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, weekPath(OPEN_WEEK))));
    await assertFails(setDoc(doc(db, 'players/x'), { displayName: 'x' }));
  });
});
