/**
 * Tunas 649 Bingo rules: docs/FIRESTORE_RULES.md §5 rows 67 to 80 (D-110 to D-129).
 * Run with: npm run test:rules. Every bingo document is function-written, so these are reads only:
 * members read their own things through the `logins/{uid}` pointer, staff read everything but the
 * secret, and nobody else reads anything.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
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
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const CYCLE = 'bingoCycles/2026-11-04';
const OPEN_DRAW = `${CYCLE}/draws/2026-11-11`;
const APPROVED_DRAW = `${CYCLE}/draws/2026-11-04`;

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-tunas-pool-bingo',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

// Alice (p1) and Bob (p2) are members; Carol (p3) has a profile and a login but isn't a member.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const now = Timestamp.now();
    for (const [pid, uid, name] of [
      ['p1', 'alice', 'Alice A.'],
      ['p2', 'bob', 'Bob B.'],
      ['p3', 'carol', 'Carol C.'],
    ]) {
      await setDoc(doc(db, `players/${pid}`), {
        displayName: name,
        phone: null,
        email: null,
        claimedByUid: uid,
        origin: 'self',
        usualPayment: null,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      await setDoc(doc(db, `logins/${uid}`), { playerId: pid, updatedAt: now });
    }
    for (const pid of ['p1', 'p2']) {
      await setDoc(doc(db, `bingoMembers/${pid}`), {
        displayName: pid,
        joinedAt: now,
        ageAttestedAt: now,
        paper: false,
        limit: 5,
        pendingLimit: null,
        pendingFromCycle: null,
        pausedThroughCycle: null,
        spent: { cycleCents: 0, byYear: {} },
      });
    }
    await setDoc(doc(db, 'bingo/config'), { enabled: false, priceCents: 1000, operatorPct: 40 });
    await setDoc(doc(db, 'bingo/secret'), { codeHash: 'x', codeVersion: 1, rotatedAt: now });
    await setDoc(doc(db, 'bingoRedeemAttempts/carol'), {
      count: 2,
      windowStart: now,
      lockedUntil: null,
    });
    await setDoc(doc(db, CYCLE), {
      status: 'open',
      number: 1,
      potCents: 0,
      board: { at3: 0, at4: 0, at5: 0, cards: 2 },
    });
    for (const [card, pid] of [
      ['cA', 'p1'],
      ['cB', 'p2'],
    ]) {
      await setDoc(doc(db, `bingoCards/${card}`), {
        playerId: pid,
        numbers: [3, 11, 19, 27, 35, 43],
        active: true,
        createdAt: now,
        createdBy: pid,
        source: 'web',
      });
      await setDoc(doc(db, `${CYCLE}/entries/${card}`), {
        playerId: pid,
        joinedDraw: '2026-11-04',
        paidDraws: ['2026-11-04'],
        hits: [11],
        count: 1,
      });
      await setDoc(doc(db, `${OPEN_DRAW}/payments/${card}`), {
        playerId: pid,
        paid: true,
        method: 'cash',
        receivedAt: now,
        confirmedAt: now,
        confirmedBy: 'boss',
        late: false,
        reason: null,
        intent: null,
      });
    }
    await setDoc(doc(db, APPROVED_DRAW), { status: 'approved', numbers: [5, 11, 22, 27, 40, 48] });
    await setDoc(doc(db, OPEN_DRAW), { status: 'upcoming', numbers: null });
    await setDoc(doc(db, `${CYCLE}/draws/2026-11-18`), {
      status: 'proposed',
      numbers: [1, 2, 3, 4, 5, 6],
    });
    await setDoc(doc(db, `${CYCLE}/draws/2026-10-28`), { status: 'skipped', numbers: null });
  });
});

const as = (uid: string, claims: Record<string, unknown> = {}) =>
  env.authenticatedContext(uid, claims).firestore();
const alice = () => as('alice');
const carol = () => as('carol');
const admin = () => as('boss', { admin: true });
const counter = () => as('devon', { counter: true });

describe('Tunas 649 Bingo: function-written, members read their own, staff read all', () => {
  it('row 67: no client, staff included, writes any bingo document', async () => {
    const paths = [
      'bingo/config',
      'bingo/secret',
      'bingoMembers/p1',
      'bingoMembers/p9',
      'bingoRedeemAttempts/alice',
      'bingoCards/cA',
      'bingoCards/cNew',
      CYCLE,
      `${CYCLE}/entries/cA`,
      OPEN_DRAW,
      `${OPEN_DRAW}/payments/cA`,
    ];
    for (const db of [alice(), admin(), counter()]) {
      for (const p of paths) {
        await assertFails(setDoc(doc(db, p), { x: 1 }));
        await assertFails(deleteDoc(doc(db, p)));
      }
      await assertFails(updateDoc(doc(db, `${OPEN_DRAW}/payments/cA`), { intent: 'cash' }));
      await assertFails(updateDoc(doc(db, 'bingoMembers/p1'), { limit: 1 }));
    }
  });

  it('row 68: nobody, admin included, reads the secret or the redeem attempts', async () => {
    for (const db of [alice(), carol(), admin(), counter()]) {
      await assertFails(getDoc(doc(db, 'bingo/secret')));
      await assertFails(getDoc(doc(db, 'bingoRedeemAttempts/carol')));
    }
    await assertFails(getDoc(doc(carol(), 'bingoRedeemAttempts/carol')));
  });

  it('row 69: members and staff read the config; a non-member, a guest, or nobody cannot', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'bingo/config')));
    await assertSucceeds(getDoc(doc(admin(), 'bingo/config')));
    await assertSucceeds(getDoc(doc(counter(), 'bingo/config')));
    await assertFails(getDoc(doc(carol(), 'bingo/config')));
    await assertFails(
      getDoc(doc(as('guest1', { firebase: { sign_in_provider: 'anonymous' } }), 'bingo/config')),
    );
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'bingo/config')));
  });

  it('row 70: a member reads their own membership, not another; staff read any', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'bingoMembers/p1')));
    await assertFails(getDoc(doc(alice(), 'bingoMembers/p2')));
    await assertFails(getDocs(collection(alice(), 'bingoMembers')));
    await assertSucceeds(getDoc(doc(admin(), 'bingoMembers/p2')));
    await assertSucceeds(getDocs(collection(counter(), 'bingoMembers')));
  });

  it('row 71: a pointer to a profile the login does not own, or to a non-member, grants nothing', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      // Mallory points her login at Alice's player.
      await setDoc(doc(ctx.firestore(), 'logins/mallory'), {
        playerId: 'p1',
        updatedAt: Timestamp.now(),
      });
    });
    const mallory = as('mallory');
    await assertFails(getDoc(doc(mallory, 'bingo/config')));
    await assertFails(getDoc(doc(mallory, CYCLE)));
    await assertFails(getDoc(doc(mallory, 'bingoCards/cA')));
    await assertFails(getDoc(doc(mallory, 'bingoMembers/p1')));
    // Carol owns her profile but isn't a member.
    await assertFails(getDoc(doc(carol(), CYCLE)));
    await assertFails(
      getDocs(query(collection(carol(), 'bingoCards'), where('playerId', '==', 'p3'))),
    );
    await assertFails(getDoc(doc(carol(), 'bingoMembers/p3')));
  });

  it('row 72: a member reads their own card, not another; staff read any', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'bingoCards/cA')));
    await assertFails(getDoc(doc(alice(), 'bingoCards/cB')));
    await assertSucceeds(getDoc(doc(admin(), 'bingoCards/cB')));
    await assertSucceeds(getDoc(doc(counter(), 'bingoCards/cB')));
  });

  it('row 73: a member lists cards filtered to their own player only', async () => {
    await assertSucceeds(
      getDocs(query(collection(alice(), 'bingoCards'), where('playerId', '==', 'p1'))),
    );
    await assertFails(getDocs(collection(alice(), 'bingoCards')));
    await assertFails(
      getDocs(query(collection(alice(), 'bingoCards'), where('playerId', '==', 'p2'))),
    );
  });

  it('row 74: members and staff read a cycle; a non-member cannot', async () => {
    await assertSucceeds(getDoc(doc(alice(), CYCLE)));
    await assertSucceeds(getDocs(collection(alice(), 'bingoCycles')));
    await assertSucceeds(getDoc(doc(counter(), CYCLE)));
    await assertFails(getDoc(doc(carol(), CYCLE)));
  });

  it("row 75: a member reads their own cycle entry, not another's; staff list all", async () => {
    await assertSucceeds(getDoc(doc(alice(), `${CYCLE}/entries/cA`)));
    await assertFails(getDoc(doc(alice(), `${CYCLE}/entries/cB`)));
    await assertSucceeds(
      getDocs(query(collection(alice(), `${CYCLE}/entries`), where('playerId', '==', 'p1'))),
    );
    await assertFails(getDocs(collection(alice(), `${CYCLE}/entries`)));
    await assertSucceeds(getDocs(collection(admin(), `${CYCLE}/entries`)));
  });

  it('row 76: a member reads approved and skipped draws only; staff read any', async () => {
    await assertSucceeds(getDoc(doc(alice(), APPROVED_DRAW)));
    await assertSucceeds(getDoc(doc(alice(), `${CYCLE}/draws/2026-10-28`)));
    await assertFails(getDoc(doc(alice(), OPEN_DRAW)));
    await assertFails(getDoc(doc(alice(), `${CYCLE}/draws/2026-11-18`)));
    await assertSucceeds(
      getDocs(
        query(
          collection(alice(), `${CYCLE}/draws`),
          where('status', 'in', ['approved', 'skipped']),
        ),
      ),
    );
    await assertFails(getDocs(collection(alice(), `${CYCLE}/draws`)));
    await assertSucceeds(getDoc(doc(counter(), `${CYCLE}/draws/2026-11-18`)));
    await assertSucceeds(getDocs(collection(admin(), `${CYCLE}/draws`)));
  });

  it("row 77: a member reads their own card's payment, not another's; staff list a draw's payments", async () => {
    // The draw itself is still upcoming, so Alice can't read it, but she can read her payment under it.
    await assertSucceeds(getDoc(doc(alice(), `${OPEN_DRAW}/payments/cA`)));
    await assertFails(getDoc(doc(alice(), `${OPEN_DRAW}/payments/cB`)));
    await assertFails(getDocs(collection(alice(), `${OPEN_DRAW}/payments`)));
    await assertSucceeds(getDocs(collection(admin(), `${OPEN_DRAW}/payments`)));
  });

  it('row 78: the counter reads payments, entries, cards, and members, but never the secret', async () => {
    await assertSucceeds(getDocs(collection(counter(), `${OPEN_DRAW}/payments`)));
    await assertSucceeds(getDocs(collection(counter(), `${CYCLE}/entries`)));
    await assertSucceeds(getDocs(collection(counter(), 'bingoCards')));
    await assertSucceeds(getDoc(doc(counter(), 'bingoMembers/p1')));
    await assertFails(getDoc(doc(counter(), 'bingo/secret')));
  });

  it('row 79: look-alike claims are not staff', async () => {
    for (const claims of [
      { counter: 'true' },
      { admin: 1 },
      { role: 'admin' },
      { counters: true },
    ]) {
      const db = as('alice', claims);
      await assertFails(getDoc(doc(db, 'bingoCards/cB')));
      await assertFails(getDoc(doc(db, `${OPEN_DRAW}/payments/cB`)));
    }
  });

  it('row 80: removing the membership, or unlinking the login, shuts everything', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), 'bingoMembers/p1'));
    });
    await assertFails(getDoc(doc(alice(), 'bingo/config')));
    await assertFails(getDoc(doc(alice(), 'bingoCards/cA')));
    await assertFails(getDoc(doc(alice(), `${OPEN_DRAW}/payments/cA`)));

    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await deleteDoc(doc(db, 'bingoMembers/p1'));
      await setDoc(doc(db, 'bingoMembers/p2'), { displayName: 'p2', limit: 5 });
      await updateDoc(doc(db, 'players/p2'), { claimedByUid: null });
    });
    const bob = as('bob');
    await assertFails(getDoc(doc(bob, CYCLE)));
    await assertFails(getDoc(doc(bob, 'bingoCards/cB')));
    await assertFails(getDoc(doc(bob, 'bingoMembers/p2')));
  });
});
