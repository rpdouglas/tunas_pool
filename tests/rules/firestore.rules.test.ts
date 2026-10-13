/**
 * The full test matrix in docs/FIRESTORE_RULES.md §5 (Firestore and Storage).
 * Run with: npm run test:rules   (starts the Firestore and Storage emulators, needs Java 21+)
 * Matrix row numbers are noted in each test name.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes, uploadString } from 'firebase/storage';

const PROJECT_ID = 'demo-tunas-pool';
const YEAR = '2026';
const OPEN_WEEK = 'wk04'; // open, lockAt in the future
const LOCKED_WEEK = 'wk03'; // locked, lockAt in the past
const REVEALED_WEEK = 'wk02'; // locked + revealed
const DRAFT_WEEK = 'wk05'; // draft, admin only

const hoursFromNow = (h: number) => Timestamp.fromMillis(Date.now() + h * 60 * 60 * 1000);
// A time the phone made up. It is a minute old on purpose: `Timestamp.now()` can land in
// the same millisecond as the server's `request.time`, and then the rules rightly accept it.
const phoneClock = () => Timestamp.fromMillis(Date.now() - 60_000);
const weekPath = (w: string) => `seasons/${YEAR}/weeks/${w}`;

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
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
    await setDoc(doc(db, weekPath(DRAFT_WEEK)), draftWeek());
    for (const status of ['locked', 'final'] as const) {
      await setDoc(doc(db, weekPath(`${status}Open`)), {
        ...baseWeek, status, lockAt: hoursFromNow(24), revealed: false,
      });
    }
    // Roster/self profile p1 is owned by alice
    await setDoc(doc(db, 'players/p1'), {
      displayName: 'Alice A.', phone: '+16135550101', email: null, claimedByUid: 'alice',
      origin: 'self', usualPayment: null, active: true,
      createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    });
    // An entry with private picks, in the open week and the revealed week
    for (const w of [OPEN_WEEK, REVEALED_WEEK]) {
      await setDoc(doc(db, `${weekPath(w)}/entries/p1`), entryData('p1'));
      await setDoc(doc(db, `${weekPath(w)}/entries/p1/payment/current`), paymentData());
      await setDoc(doc(db, `${weekPath(w)}/entries/p1/private/picks`), {
        picks: { g01: 'home' }, tiebreakerTotal: 45, updatedAt: Timestamp.now(),
      });
    }
  });
});

function draftWeek(overrides: Record<string, unknown> = {}) {
  return {
    weekNumber: 5, status: 'draft', lockAt: hoursFromNow(24 * 6), revealed: false,
    games: [], mnfGameId: 'mnf', results: {}, mnfTotal: null, entryFeeCents: 2000,
    entryCount: 0, paidCount: 0, winner: null, payoutSent: false,
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    ...overrides,
  };
}

function profile(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    displayName: 'Bob B.', phone: null, email: null, claimedByUid: uid,
    origin: 'self', usualPayment: null, active: true,
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    ...overrides,
  };
}

async function seedBob() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'players/p2'), profile('bob'));
  });
}

const admin = () => env.authenticatedContext('boss', { admin: true }).firestore();

function entryData(playerId: string, overrides: Record<string, unknown> = {}) {
  return {
    playerId,
    displayName: 'Alice A.',
    enteredBy: 'self',
    source: 'web',
    paperPhotoPath: null,
    lateOverride: null,
    picksSubmittedAt: serverTimestamp(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  };
}

function paymentData(overrides: Record<string, unknown> = {}) {
  return { paymentMethod: 'etransfer', paymentIntent: 'will_do', paymentStatus: 'unpaid', updatedAt: Timestamp.now(), ...overrides };
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

  it('#3 the owner can update their own phone', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(updateDoc(doc(db, 'players/p1'), { phone: '+16135550199', updatedAt: Timestamp.now() }));
  });

  it('#4 the owner cannot change claimedByUid', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'players/p1'), { claimedByUid: 'mallory' }, { merge: true }));
  });

  it('#5 only the owner (or admin) can read a profile', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('alice').firestore(), 'players/p1')));
    await assertSucceeds(getDoc(doc(admin(), 'players/p1')));
    await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(), 'players/p1')));
  });

  it('#5b a login can find the profile linked to it by query, and nobody else can list profiles', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDocs(query(collection(alice, 'players'), where('claimedByUid', '==', 'alice'))));
    const bob = env.authenticatedContext('bob').firestore();
    await assertFails(getDocs(query(collection(bob, 'players'), where('claimedByUid', '==', 'alice'))));
    await assertFails(getDocs(collection(bob, 'players')));
  });

  it('#6 admin can create an unclaimed roster player', async () => {
    await assertSucceeds(setDoc(doc(admin(), 'players/r1'), profile('x', { claimedByUid: null, origin: 'admin' })));
  });

  it('#7 admin cannot create a roster player that is already claimed', async () => {
    await assertFails(setDoc(doc(admin(), 'players/r1'), profile('alice', { origin: 'admin' })));
  });

  it('#8 admin cannot change claimedByUid on a player', async () => {
    await assertSucceeds(updateDoc(doc(admin(), 'players/p1'), { notes: 'Pays cash' }));
    await assertFails(updateDoc(doc(admin(), 'players/p1'), { claimedByUid: 'boss' }));
  });

  const roster = (overrides: Record<string, unknown> = {}) =>
    profile('x', { claimedByUid: null, origin: 'admin', notes: null, ...overrides });

  it('#40 a roster player needs only a name: no phone, email, or account; the name is checked', async () => {
    await assertSucceeds(setDoc(doc(admin(), 'players/r1'), roster({ displayName: 'Rosalie M.' })));
    await assertFails(setDoc(doc(admin(), 'players/r2'), roster({ displayName: '' })));
    await assertFails(setDoc(doc(admin(), 'players/r2'), roster({ displayName: 'x'.repeat(61) })));
    await assertFails(setDoc(doc(admin(), 'players/r2'), roster({ active: 'yes' })));
    await assertFails(setDoc(doc(admin(), 'players/r2'), roster({ mergedInto: 'p1' })));
    await assertFails(setDoc(doc(admin(), 'players/r2'), roster({ origin: 'self' })));
    // A player cannot add someone to the roster.
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(alice, 'players/r3'), roster()));
  });

  it('#41 admin edits roster details and deactivates, but cannot change origin, a merge, or the age confirmation', async () => {
    await assertSucceeds(setDoc(doc(admin(), 'players/r1'), roster()));
    const r1 = doc(admin(), 'players/r1');
    await assertSucceeds(
      updateDoc(r1, {
        displayName: 'Rosalie M.', phone: '+16135550144', usualPayment: 'cash',
        notes: 'Large print sheet', updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(updateDoc(r1, { active: false }));
    await assertSucceeds(updateDoc(r1, { active: true }));
    await assertFails(updateDoc(r1, { displayName: '' }));
    await assertFails(updateDoc(r1, { origin: 'self' }));
    await assertFails(updateDoc(r1, { mergedInto: 'p1' }));
    await assertFails(updateDoc(r1, { ageAttestedAt: serverTimestamp() }));
    await assertFails(deleteDoc(r1));
  });

  it('#42 admin can list the whole roster; a player cannot, and cannot read a roster profile', async () => {
    await assertSucceeds(setDoc(doc(admin(), 'players/r1'), roster()));
    await assertSucceeds(getDocs(collection(admin(), 'players')));
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(getDocs(collection(alice, 'players')));
    await assertFails(getDoc(doc(alice, 'players/r1')));
    await assertFails(getDocs(query(collection(alice, 'players'), where('origin', '==', 'admin'))));
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

  it('#11 the owner cannot create an entry when the week is draft, locked, or final', async () => {
    await seedBob();
    const db = env.authenticatedContext('bob').firestore();
    for (const w of [DRAFT_WEEK, 'lockedOpen', 'finalOpen']) {
      await assertFails(setDoc(doc(db, `${weekPath(w)}/entries/p2`), entryData('p2', { displayName: 'Bob B.' })));
    }
  });

  it('#12 the owner cannot mark their own entry paid', async () => {
    await seedBob();
    const db = env.authenticatedContext('bob').firestore();
    const ref = doc(db, `${weekPath(OPEN_WEEK)}/entries/p2/payment/current`);
    await assertFails(setDoc(ref, paymentData({ paymentStatus: 'paid' })));
    await assertSucceeds(setDoc(ref, paymentData()));
  });

  it('#12b payment details cannot ride on the public entry (D-036)', async () => {
    await seedBob();
    const db = env.authenticatedContext('bob').firestore();
    await assertFails(
      setDoc(doc(db, `${weekPath(OPEN_WEEK)}/entries/p2`), entryData('p2', { paymentMethod: 'cash' })),
    );
  });

  it('#13 the owner can change how they pay, but not paymentStatus', async () => {
    const db = env.authenticatedContext('alice').firestore();
    const ref = doc(db, `${weekPath(OPEN_WEEK)}/entries/p1/payment/current`);
    await assertFails(updateDoc(ref, { paymentStatus: 'paid' }));
    await assertFails(updateDoc(ref, { paidAt: Timestamp.now() }));
    await assertSucceeds(updateDoc(ref, { paymentMethod: 'cash', paymentIntent: 'already_did', updatedAt: Timestamp.now() }));
    await assertFails(updateDoc(doc(db, `${weekPath(LOCKED_WEEK)}/entries/p1/payment/current`), { paymentMethod: 'cash' }));
  });

  it("#14 a player cannot create an entry for someone else's playerId", async () => {
    await seedBob();
    const db = env.authenticatedContext('bob').firestore();
    await assertFails(setDoc(doc(db, `${weekPath(OPEN_WEEK)}/entries/p1`), entryData('p1')));
    await assertFails(setDoc(doc(db, `${weekPath(OPEN_WEEK)}/entries/p3`), entryData('p2')));
  });

  it('#15 a second submit edits the same entry doc', async () => {
    const db = env.authenticatedContext('alice').firestore();
    const ref = doc(db, `${weekPath(OPEN_WEEK)}/entries/p1`);
    await assertSucceeds(
      updateDoc(ref, { displayName: 'Ali A.', picksSubmittedAt: serverTimestamp(), updatedAt: Timestamp.now() }),
    );
    let count = 0;
    await env.withSecurityRulesDisabled(async (ctx) => {
      count = (await getDocs(collection(ctx.firestore(), `${weekPath(OPEN_WEEK)}/entries`))).size;
    });
    expect(count).toBe(1);
  });

  it('#16 the owner can write picks while open', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(db, `${weekPath(OPEN_WEEK)}/entries/p1/private/picks`), {
        picks: { g01: 'away', mnf: 'home' }, tiebreakerTotal: 44, updatedAt: serverTimestamp(),
      }),
    );
  });

  it('#17 the owner cannot write picks after lock', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(
      setDoc(doc(db, `${weekPath(LOCKED_WEEK)}/entries/p1/private/picks`), {
        picks: { g01: 'away' }, tiebreakerTotal: 40, updatedAt: serverTimestamp(),
      }),
    );
  });
});

describe('picks validation', () => {
  const picks = (tiebreakerTotal: unknown, n = 15) => ({
    picks: Object.fromEntries(Array.from({ length: n }, (_, i) => [`g${i}`, 'home'])),
    tiebreakerTotal,
    updatedAt: serverTimestamp(),
  });
  const write = (data: object) =>
    setDoc(doc(env.authenticatedContext('alice').firestore(), `${weekPath(OPEN_WEEK)}/entries/p1/private/picks`), data);

  it('#18 the tiebreaker must be a whole number from 0 to 200', async () => {
    await assertSucceeds(write(picks(0)));
    await assertSucceeds(write(picks(200)));
    await assertFails(write(picks(-1)));
    await assertFails(write(picks(45.5)));
    await assertFails(write(picks(201)));
    await assertFails(write(picks('45')));
  });

  it('#19 no more than 15 picks', async () => {
    await assertFails(write(picks(45, 16)));
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

  it('#24 a claimant can read their own claim; others cannot', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'claims/c1'), { requesterUid: 'alice', status: 'pending' });
    });
    await assertSucceeds(getDoc(doc(env.authenticatedContext('alice').firestore(), 'claims/c1')));
    await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(), 'claims/c1')));
  });

  it('#25 clients cannot write auditLog or standings', async () => {
    const db = env.authenticatedContext('boss', { admin: true }).firestore();
    await assertFails(setDoc(doc(db, 'auditLog/a1'), { action: 'payment.set' }));
    await assertFails(setDoc(doc(db, `seasons/${YEAR}/standings/p1`), { wins: 99 }));
    await assertFails(setDoc(doc(db, 'players/p1/stats/allTime'), { wins: 99 }));
  });

  it('#26 admin can read the audit log; players cannot', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('boss', { admin: true }).firestore(), 'auditLog/a1')));
    await assertFails(getDoc(doc(env.authenticatedContext('alice').firestore(), 'auditLog/a1')));
  });

  it('#30 admin cannot write an entry or picks directly from the client', async () => {
    await assertFails(setDoc(doc(admin(), `${weekPath(OPEN_WEEK)}/entries/p1`), entryData('p1', { enteredBy: 'admin' })));
    await assertFails(
      setDoc(doc(admin(), `${weekPath(OPEN_WEEK)}/entries/p1/private/picks`), {
        picks: { g01: 'home' }, tiebreakerTotal: 45, updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(setDoc(doc(admin(), `${weekPath(OPEN_WEEK)}/entries/p1/payment/current`), paymentData({ paymentStatus: 'paid' })));
    await assertFails(deleteDoc(doc(admin(), `${weekPath(OPEN_WEEK)}/entries/p1`)));
  });

  it('#31 unauthenticated users cannot read or write anything', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, weekPath(OPEN_WEEK))));
    await assertFails(setDoc(doc(db, 'players/x'), { displayName: 'x' }));
  });
});

describe('weeks', () => {
  it('#27 players cannot read a draft week; admin can', async () => {
    await assertFails(getDoc(doc(env.authenticatedContext('alice').firestore(), weekPath(DRAFT_WEEK))));
    await assertSucceeds(getDoc(doc(admin(), weekPath(DRAFT_WEEK))));
    await assertSucceeds(getDoc(doc(env.authenticatedContext('alice').firestore(), weekPath(OPEN_WEEK))));
  });

  it('#28 admin can create and edit a draft week, but not an open one', async () => {
    await assertSucceeds(setDoc(doc(admin(), weekPath('wk06')), draftWeek({ weekNumber: 6 })));
    await assertSucceeds(updateDoc(doc(admin(), weekPath(DRAFT_WEEK)), { games: [], updatedAt: Timestamp.now() }));
    await assertFails(updateDoc(doc(admin(), weekPath(OPEN_WEEK)), { games: [] }));
    await assertFails(updateDoc(doc(admin(), weekPath(DRAFT_WEEK)), { status: 'open' }));
    await assertFails(setDoc(doc(admin(), weekPath('wk07')), draftWeek({ status: 'open' })));
    await assertFails(setDoc(doc(env.authenticatedContext('alice').firestore(), weekPath('wk06')), draftWeek()));
  });

  it('#29 admin cannot set revealed: true directly', async () => {
    await assertFails(updateDoc(doc(admin(), weekPath(DRAFT_WEEK)), { revealed: true }));
    await assertFails(setDoc(doc(admin(), weekPath('wk06')), draftWeek({ revealed: true })));
  });

  it('#29b admin cannot write derived week fields from the client (D-025)', async () => {
    await assertFails(updateDoc(doc(admin(), weekPath(DRAFT_WEEK)), { entryCount: 5 }));
    await assertFails(updateDoc(doc(admin(), weekPath(DRAFT_WEEK)), { paidCount: 5 }));
    await assertFails(setDoc(doc(admin(), weekPath('wk06')), draftWeek({ paidCount: 3 })));
    await assertFails(setDoc(doc(admin(), weekPath('wk06')), draftWeek({ winner: { playerIds: ['p1'] } })));
  });
});

describe('storage', () => {
  const path = 'paperSheets/2026/wk04/p1.jpg';

  const jpeg = { contentType: 'image/jpeg' };

  it('#32 only admin can read or write paper-sheet photos', async () => {
    const adminStorage = env.authenticatedContext('boss', { admin: true }).storage();
    await assertSucceeds(uploadString(ref(adminStorage, path), 'photo', 'raw', jpeg));
    await assertSucceeds(getBytes(ref(adminStorage, path)));
    const player = env.authenticatedContext('alice').storage();
    await assertFails(getBytes(ref(player, path)));
    await assertFails(uploadString(ref(player, path), 'photo', 'raw', jpeg));
    await assertFails(uploadString(ref(adminStorage, 'other/file.jpg'), 'x', 'raw', jpeg));
  });

  it('#43 a paper-sheet photo must be an image of 5 MB or less; admin can replace and delete it', async () => {
    const adminStorage = env.authenticatedContext('boss', { admin: true }).storage();
    await assertFails(uploadString(ref(adminStorage, path), 'not a photo'));
    await assertFails(
      uploadString(ref(adminStorage, path), 'x', 'raw', { contentType: 'application/pdf' }),
    );
    await assertFails(
      uploadBytes(ref(adminStorage, path), new Uint8Array(5 * 1024 * 1024 + 1), jpeg),
    );
    await assertSucceeds(uploadBytes(ref(adminStorage, path), new Uint8Array(200_000), jpeg));
    await assertSucceeds(uploadString(ref(adminStorage, path), 'retake', 'raw', jpeg));
    await assertSucceeds(deleteObject(ref(adminStorage, path)));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadString(ref(ctx.storage(), path), 'photo', 'raw', jpeg);
    });
    await assertFails(deleteObject(ref(env.authenticatedContext('alice').storage(), path)));
  });
});

describe('Sprint 2: private payment, server times, age, open weeks', () => {
  const paymentPath = (w: string) => `${weekPath(w)}/entries/p1/payment/current`;

  it('#33 payment is private to the owner and admin, even after the reveal (D-036)', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('alice').firestore(), paymentPath(OPEN_WEEK))));
    await assertSucceeds(getDoc(doc(admin(), paymentPath(OPEN_WEEK))));
    await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(), paymentPath(OPEN_WEEK))));
    await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(), paymentPath(REVEALED_WEEK))));
    await assertSucceeds(getDoc(doc(env.authenticatedContext('bob').firestore(), `${weekPath(OPEN_WEEK)}/entries/p1`)));
  });

  it('#34 the server stamps submission times, not the phone (D-040)', async () => {
    await seedBob();
    const db = env.authenticatedContext('bob').firestore();
    const entry = doc(db, `${weekPath(OPEN_WEEK)}/entries/p2`);
    await assertFails(setDoc(entry, entryData('p2', { picksSubmittedAt: phoneClock() })));
    await assertSucceeds(setDoc(entry, entryData('p2')));
    await assertFails(updateDoc(entry, { picksSubmittedAt: phoneClock() }));
    const picks = doc(db, `${weekPath(OPEN_WEEK)}/entries/p2/private/picks`);
    await assertFails(setDoc(picks, { picks: { g01: 'home' }, tiebreakerTotal: 40, updatedAt: phoneClock() }));
    await assertSucceeds(setDoc(picks, { picks: { g01: 'home' }, tiebreakerTotal: 40, updatedAt: serverTimestamp() }));
  });

  it('#35 the age confirmation on a profile is stamped by the server (D-037)', async () => {
    const carol = env.authenticatedContext('carol').firestore();
    await assertFails(setDoc(doc(carol, 'players/carol'), profile('carol', { ageAttestedAt: phoneClock() })));
    await assertSucceeds(setDoc(doc(carol, 'players/carol'), profile('carol', { ageAttestedAt: serverTimestamp() })));
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(alice, 'players/p1'), { ageAttestedAt: phoneClock() }));
    await assertSucceeds(updateDoc(doc(alice, 'players/p1'), { ageAttestedAt: serverTimestamp(), updatedAt: Timestamp.now() }));
  });

  it('#36 players can list open, locked, and final weeks, but not drafts', async () => {
    const db = env.authenticatedContext('alice').firestore();
    const weeks = collection(db, `seasons/${YEAR}/weeks`);
    await assertSucceeds(getDocs(query(weeks, where('status', 'in', ['open', 'locked', 'final']))));
    await assertFails(getDocs(weeks));
    await assertFails(getDocs(query(weeks, where('status', '==', 'draft'))));
  });
});

describe('Sprint 3: results, records, and the winner stay function-written', () => {
  it('#37 players cannot write their own record, or anyone else\'s, but every signed-in user can read it', async () => {
    await seedBob();
    const bob = env.authenticatedContext('bob').firestore();
    await assertFails(
      setDoc(doc(bob, `${weekPath(OPEN_WEEK)}/entries/p2`), entryData('p2', { record: { wins: 15, losses: 0 } })),
    );
    await assertSucceeds(setDoc(doc(bob, `${weekPath(OPEN_WEEK)}/entries/p2`), entryData('p2')));
    await assertFails(updateDoc(doc(bob, `${weekPath(OPEN_WEEK)}/entries/p2`), { record: { wins: 15, losses: 0 } }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${weekPath(OPEN_WEEK)}/entries/p1`), { record: { wins: 9, losses: 6 } });
    });
    await assertSucceeds(getDoc(doc(bob, `${weekPath(OPEN_WEEK)}/entries/p1`)));
  });

  it('#38 an admin cannot write results, the total, the winner, the payout flag, or the status from the client', async () => {
    for (const patch of [
      { results: { g01: 'home' } },
      { mnfTotal: 46 },
      { winner: { playerIds: ['p1'] } },
      { payoutSent: true },
      { status: 'final' },
    ]) {
      await assertFails(updateDoc(doc(admin(), weekPath(DRAFT_WEEK)), patch));
      await assertFails(updateDoc(doc(admin(), weekPath('lockedOpen')), patch));
    }
  });

  it('#39 an admin can read every entry\'s payment record and picks (the payments queue and results screen need them)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${weekPath(LOCKED_WEEK)}/entries/p1`), entryData('p1'));
      await setDoc(doc(ctx.firestore(), `${weekPath(LOCKED_WEEK)}/entries/p1/payment/current`), paymentData());
      await setDoc(doc(ctx.firestore(), `${weekPath(LOCKED_WEEK)}/entries/p1/private/picks`), {
        picks: { g01: 'home' }, tiebreakerTotal: 45, updatedAt: Timestamp.now(),
      });
    });
    await assertSucceeds(getDoc(doc(admin(), `${weekPath(LOCKED_WEEK)}/entries/p1/payment/current`)));
    await assertSucceeds(getDoc(doc(admin(), `${weekPath(LOCKED_WEEK)}/entries/p1/private/picks`)));
    await assertSucceeds(getDocs(collection(admin(), `${weekPath(LOCKED_WEEK)}/entries`)));
    await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(), `${weekPath(LOCKED_WEEK)}/entries/p1/payment/current`)));
  });
});

describe('Sprint 5: asking to claim a profile reveals nothing', () => {
  const ROSTER = 'players/rosalie';
  const rosterEntry = `${weekPath(OPEN_WEEK)}/entries/rosalie`;

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, ROSTER), {
        displayName: 'Rosalie M.', phone: '+16135550144', email: null, claimedByUid: null,
        origin: 'admin', usualPayment: 'cash', notes: 'Large print', active: true,
        createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      });
      await setDoc(doc(db, rosterEntry), entryData('rosalie', { enteredBy: 'admin', source: 'paper' }));
      await setDoc(doc(db, `${rosterEntry}/payment/current`), paymentData());
      await setDoc(doc(db, `${rosterEntry}/private/picks`), {
        picks: { g01: 'home' }, tiebreakerTotal: 41, updatedAt: Timestamp.now(),
      });
      for (const [id, status] of [['c1', 'pending'], ['c2', 'rejected']] as const) {
        await setDoc(doc(db, `claims/${id}`), {
          requesterUid: 'snoop', requesterEmail: 'snoop@example.com', claimedName: 'Rosalie M.',
          claimedPhone: '+16135550144', status, suggestedPlayerId: null, resolvedPlayerId: null,
          createdAt: Timestamp.now(),
        });
      }
    });
  });

  it('#44 a pending or rejected claimant cannot read the profile they named, its picks, or its payment', async () => {
    const snoop = env.authenticatedContext('snoop', { email: 'snoop@example.com' }).firestore();
    await assertFails(getDoc(doc(snoop, ROSTER)));
    await assertFails(getDocs(query(collection(snoop, 'players'), where('phone', '==', '+16135550144'))));
    await assertFails(getDocs(query(collection(snoop, 'players'), where('displayName', '==', 'Rosalie M.'))));
    await assertFails(getDoc(doc(snoop, `${rosterEntry}/private/picks`)));
    await assertFails(getDoc(doc(snoop, `${rosterEntry}/payment/current`)));
    await assertFails(getDoc(doc(snoop, `${ROSTER}/stats/allTime`)));
    // And cannot write as that player.
    await assertFails(updateDoc(doc(snoop, rosterEntry), { displayName: 'Mine now', picksSubmittedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(snoop, ROSTER), { phone: '+16135550199' }));
  });

  it('#45 a player reads their own claims by query; not all claims, not another login\'s, and cannot approve their own', async () => {
    const snoop = env.authenticatedContext('snoop').firestore();
    const mine = await assertSucceeds(
      getDocs(query(collection(snoop, 'claims'), where('requesterUid', '==', 'snoop'))),
    );
    expect(mine.size).toBe(2);
    await assertFails(getDocs(collection(snoop, 'claims')));
    await assertFails(getDocs(query(collection(snoop, 'claims'), where('status', '==', 'pending'))));
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(getDocs(query(collection(alice, 'claims'), where('requesterUid', '==', 'snoop'))));
    await assertFails(getDoc(doc(alice, 'claims/c1')));
    await assertFails(updateDoc(doc(snoop, 'claims/c1'), { status: 'approved', resolvedPlayerId: 'rosalie' }));
    await assertFails(setDoc(doc(snoop, 'claims/c9'), { requesterUid: 'snoop', claimedName: 'Rosalie M.', status: 'pending' }));
    await assertSucceeds(getDocs(collection(admin(), 'claims')));
  });

  it('#46 only the link decides: once approved the login owns the profile and its entries, and unlinking takes that away', async () => {
    const kid = env.authenticatedContext('kid').firestore();
    await assertFails(getDoc(doc(kid, ROSTER)));
    // What adminApproveClaim does, with the Admin SDK.
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), ROSTER), { claimedByUid: 'kid' }));
    await assertSucceeds(getDoc(doc(kid, ROSTER)));
    const found = await assertSucceeds(
      getDocs(query(collection(kid, 'players'), where('claimedByUid', '==', 'kid'))),
    );
    expect(found.docs.map((d) => d.id)).toEqual(['rosalie']);
    await assertSucceeds(getDoc(doc(kid, `${rosterEntry}/private/picks`)));
    await assertSucceeds(getDoc(doc(kid, `${rosterEntry}/payment/current`)));
    await assertSucceeds(
      updateDoc(doc(kid, rosterEntry), { displayName: 'Rosalie M.', picksSubmittedAt: serverTimestamp() }),
    );
    // The owner still cannot hand the profile to someone else, or mark it paid.
    await assertFails(updateDoc(doc(kid, ROSTER), { claimedByUid: 'snoop' }));
    await assertFails(updateDoc(doc(kid, `${rosterEntry}/payment/current`), { paymentStatus: 'paid' }));
    // What adminUnlinkClaim does.
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), ROSTER), { claimedByUid: null }));
    await assertFails(getDoc(doc(kid, ROSTER)));
    await assertFails(getDoc(doc(kid, `${rosterEntry}/private/picks`)));
    await assertFails(updateDoc(doc(kid, rosterEntry), { displayName: 'Rosalie M.', picksSubmittedAt: serverTimestamp() }));
  });
});


describe('Sprint 6: the reveal and corrections', () => {
  it('#47 once a week is revealed any player can list its entries and read every set of picks, but never a payment; before that, only the list', async () => {
    const bob = env.authenticatedContext('bob').firestore();
    const revealed = await assertSucceeds(getDocs(collection(bob, `${weekPath(REVEALED_WEEK)}/entries`)));
    expect(revealed.docs.map((d) => d.id)).toEqual(['p1']);
    await assertSucceeds(getDoc(doc(bob, `${weekPath(REVEALED_WEEK)}/entries/p1/private/picks`)));
    await assertFails(getDoc(doc(bob, `${weekPath(REVEALED_WEEK)}/entries/p1/payment/current`)));
    // The week itself is readable, so the page can show results and the winner.
    await assertSucceeds(getDoc(doc(bob, weekPath(REVEALED_WEEK))));
    // Not revealed yet: who is in, but not what they picked.
    await assertSucceeds(getDocs(collection(bob, `${weekPath(OPEN_WEEK)}/entries`)));
    await assertFails(getDoc(doc(bob, `${weekPath(OPEN_WEEK)}/entries/p1/private/picks`)));
    // Revealed picks still cannot be changed by anyone from the client.
    await assertFails(
      setDoc(doc(bob, `${weekPath(REVEALED_WEEK)}/entries/p1/private/picks`), {
        picks: { g01: 'away' }, tiebreakerTotal: 45, updatedAt: serverTimestamp(),
      }),
    );
  });

  it('#48 nobody corrects a published week from the client: results, the winner, and the correction note are function-written', async () => {
    for (const client of [admin(), env.authenticatedContext('alice').firestore()]) {
      const final = doc(client, weekPath('finalOpen'));
      await assertFails(updateDoc(final, { correctedAt: serverTimestamp() }));
      await assertFails(updateDoc(final, { results: { g01: 'away' } }));
      await assertFails(updateDoc(final, { 'winner.playerIds': ['p1'] }));
      await assertFails(updateDoc(final, { payoutSent: false }));
    }
  });

  it('#49 no client can mark a week as backfilled, on a new draft or an existing one', async () => {
    await assertFails(setDoc(doc(admin(), weekPath('wk09')), draftWeek({ backfilled: true })));
    await assertFails(setDoc(doc(admin(), weekPath('wk09')), draftWeek({ correctedAt: serverTimestamp() })));
    await assertSucceeds(setDoc(doc(admin(), weekPath('wk09')), draftWeek()));
    await assertFails(updateDoc(doc(admin(), weekPath('wk09')), { backfilled: true }));
    await assertFails(updateDoc(doc(admin(), weekPath(LOCKED_WEEK)), { backfilled: true }));
    await assertSucceeds(updateDoc(doc(admin(), weekPath('wk09')), { games: [] }));
  });
});

describe('Sprint 7: standings and stats', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `seasons/${YEAR}/standings/p1`), {
        displayName: 'Alice A.', weeksPlayed: 2, wins: 19, losses: 11, weeklyTitles: 1, weekRecords: {},
      });
      await setDoc(doc(db, 'players/p1/stats/allTime'), { weeksPlayed: 2, wins: 19, losses: 11, weeklyTitles: 1 });
    });
  });

  it('#50 any signed-in player reads the season standings (a name and a record); nobody writes them from a client', async () => {
    const bob = env.authenticatedContext('bob').firestore();
    const all = await assertSucceeds(getDocs(collection(bob, `seasons/${YEAR}/standings`)));
    expect(Object.keys(all.docs[0].data()).sort()).toEqual([
      'displayName', 'losses', 'weekRecords', 'weeklyTitles', 'weeksPlayed', 'wins',
    ]);
    await assertSucceeds(getDoc(doc(bob, `seasons/${YEAR}/standings/p1`)));
    await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), `seasons/${YEAR}/standings`)));
    for (const client of [bob, admin(), env.authenticatedContext('alice').firestore()]) {
      await assertFails(setDoc(doc(client, `seasons/${YEAR}/standings/p1`), { displayName: 'Alice A.', wins: 99 }));
      await assertFails(updateDoc(doc(client, `seasons/${YEAR}/standings/p1`), { wins: 99 }));
    }
  });

  it('#51 all-time stats are for the player and the admin only, and function-written', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDoc(doc(alice, 'players/p1/stats/allTime')));
    await assertSucceeds(getDoc(doc(admin(), 'players/p1/stats/allTime')));
    await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(), 'players/p1/stats/allTime')));
    await assertFails(setDoc(doc(alice, 'players/p1/stats/allTime'), { wins: 99 }));
    await assertFails(setDoc(doc(admin(), 'players/p1/stats/allTime'), { wins: 99 }));
  });
});

describe('Sprint 10: seasons', () => {
  it('#52 admin creates an active season with its first week, but archiving, reopening, and deleting are not client writes', async () => {
    const season = (overrides: Record<string, unknown> = {}) => ({
      year: '2027', status: 'active', entryFeeCents: 2000, createdAt: serverTimestamp(), ...overrides,
    });
    await assertFails(setDoc(doc(admin(), 'seasons/2027'), season({ status: 'archived' })));
    await assertFails(setDoc(doc(admin(), 'seasons/2027'), season({ archivedAt: serverTimestamp() })));
    await assertSucceeds(setDoc(doc(admin(), 'seasons/2027'), season()));
    await assertSucceeds(updateDoc(doc(admin(), 'seasons/2027'), { entryFeeCents: 2500 }));
    await assertFails(updateDoc(doc(admin(), 'seasons/2027'), { status: 'archived' }));
    await assertFails(updateDoc(doc(admin(), 'seasons/2027'), { archivedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(admin(), 'seasons/2027')));
    // Players read seasons (the history page lists them) and write nothing.
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDoc(doc(alice, 'seasons/2027')));
    await assertFails(setDoc(doc(alice, 'seasons/2028'), season({ year: '2028' })));
    await assertFails(updateDoc(doc(alice, 'seasons/2027'), { entryFeeCents: 1 }));
  });
});


describe('Counter role (D-095): daily work only, nothing private, nothing irreversible', () => {
  const devon = () => env.authenticatedContext('devon', { counter: true }).firestore();
  const devonStorage = () => env.authenticatedContext('devon', { counter: true }).storage();
  const sheetPath = 'paperSheets/2026/wk04/p1.jpg';
  const jpeg = { contentType: 'image/jpeg' };

  it('#53 a counter reads exactly what any signed-in player reads, and no private data', async () => {
    // Public: open weeks and the public part of an entry.
    await assertSucceeds(getDoc(doc(devon(), weekPath(OPEN_WEEK))));
    await assertSucceeds(getDoc(doc(devon(), `${weekPath(OPEN_WEEK)}/entries/p1`)));
    // Private: someone else's profile (phone, email, notes), payment, picks before the reveal,
    // the audit log, claims, and a week still being set up.
    await assertFails(getDoc(doc(devon(), 'players/p1')));
    await assertFails(getDocs(collection(devon(), 'players')));
    await assertFails(getDoc(doc(devon(), `${weekPath(OPEN_WEEK)}/entries/p1/payment/current`)));
    await assertFails(getDoc(doc(devon(), `${weekPath(OPEN_WEEK)}/entries/p1/private/picks`)));
    await assertFails(getDocs(collection(devon(), 'auditLog')));
    await assertFails(getDocs(collection(devon(), 'claims')));
    await assertFails(getDoc(doc(devon(), weekPath(DRAFT_WEEK))));
    // After the reveal the picks are public, for the counter as for everyone.
    await assertSucceeds(getDoc(doc(devon(), `${weekPath(REVEALED_WEEK)}/entries/p1/private/picks`)));
  });

  it('#54 a counter cannot write what only the commissioner writes, from the browser', async () => {
    await assertFails(
      setDoc(doc(devon(), 'players/walk-in'), {
        displayName: 'Walk In', phone: null, email: null, claimedByUid: null, origin: 'admin',
        usualPayment: null, notes: null, active: true,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(updateDoc(doc(devon(), 'players/p1'), { displayName: 'Hacked' }));
    await assertFails(setDoc(doc(devon(), weekPath('wk09')), draftWeek()));
    await assertFails(updateDoc(doc(devon(), weekPath(DRAFT_WEEK)), { weekNumber: 9 }));
    await assertFails(setDoc(doc(devon(), 'config/pool'), { entryFeeCents: 100 }));
    await assertFails(
      updateDoc(doc(devon(), `${weekPath(OPEN_WEEK)}/entries/p1/payment/current`), {
        paymentStatus: 'paid',
      }),
    );
    await assertFails(deleteDoc(doc(devon(), `${weekPath(OPEN_WEEK)}/entries/p1`)));
    await assertFails(deleteDoc(doc(devon(), 'players/p1')));
  });

  it('#55 a counter can add a sheet photo, and cannot read, replace-by-reading, or delete one', async () => {
    await assertSucceeds(uploadString(ref(devonStorage(), sheetPath), 'photo', 'raw', jpeg));
    await assertFails(getBytes(ref(devonStorage(), sheetPath)));
    await assertFails(deleteObject(ref(devonStorage(), sheetPath)));
    // Same limits as the commissioner: an image, 5 MB at most, only under paperSheets.
    await assertFails(
      uploadString(ref(devonStorage(), sheetPath), 'x', 'raw', { contentType: 'application/pdf' }),
    );
    await assertFails(
      uploadBytes(ref(devonStorage(), sheetPath), new Uint8Array(5 * 1024 * 1024 + 1), jpeg),
    );
    await assertFails(uploadString(ref(devonStorage(), 'other/file.jpg'), 'x', 'raw', jpeg));
  });

  it('#56 only a real true counts: look-alike claims are an ordinary player', async () => {
    for (const claims of [{ counter: 'true' }, { counter: 1 }, { role: 'counter' }, { counters: true }]) {
      const fake = env.authenticatedContext('fake', claims);
      await assertFails(uploadString(ref(fake.storage(), sheetPath), 'photo', 'raw', jpeg));
    }
  });
});
