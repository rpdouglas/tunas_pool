/**
 * Shared set-up for the bingo integration tests. A Toronto week: the first game opens Thursday
 * 2026-11-05 and its first draw is Wednesday 2026-11-11 (cutoff 6:00 PM EST = 23:00 UTC).
 */
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { clearDb } from '../testSupport.int';
import { addMember, redeemCode, setCode, setConfig } from './members';
import { startCycle } from './cycle';

export const at = (iso: string) => new Date(iso);
export const THU = at('2026-11-05T10:00:00-05:00');
export const FIRST = '2026-11-11';
export const CODE = 'TUNA-6492-BINGO';

export const BOSS = { actorUid: 'boss' };
export const DEVON = {
  actorUid: 'devon',
  actorRole: 'counter' as const,
  actorEmail: 'devon@shop.test',
};

export const CONFIG = {
  enabled: false,
  priceCents: 1000,
  operatorPct: 40,
  cutoff: { weekday: 3, time: '18:00', tz: 'America/Toronto' },
  maxCardsPerPlayer: 5,
  maxWeeks: 26,
  joinWindowDraws: 1,
};

export async function seedPlayer(
  db: Firestore,
  playerId: string,
  name: string,
  uid: string | null,
  attested = true,
) {
  await db.doc(`players/${playerId}`).set({
    displayName: name,
    phone: null,
    email: null,
    claimedByUid: uid,
    origin: uid ? 'self' : 'admin',
    usualPayment: null,
    active: true,
    ...(attested ? { ageAttestedAt: Timestamp.fromDate(at('2026-09-01T12:00:00-04:00')) } : {}),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

/** Config, a code, Alice (p1) and Bob (p2) joined with the code, Rosalie (p3) added on paper by Devon. */
export async function seedBingo(
  db: Firestore,
  options: { start?: boolean; config?: Partial<typeof CONFIG> } = {},
) {
  await clearDb();
  await setConfig(db, { ...BOSS, config: { ...CONFIG, ...options.config }, now: THU });
  await setCode(db, { ...BOSS, code: CODE, now: THU });
  await seedPlayer(db, 'p1', 'Alice A.', 'alice');
  await seedPlayer(db, 'p2', 'Bob B.', 'bob');
  await seedPlayer(db, 'p3', 'Rosalie R.', null, false);
  await redeemCode(db, { uid: 'alice', savedAccount: true, playerId: 'p1', code: CODE, now: THU });
  await redeemCode(db, { uid: 'bob', savedAccount: true, playerId: 'p2', code: CODE, now: THU });
  await addMember(db, { ...DEVON, playerId: 'p3', ageConfirmed: true, now: THU });
  if (options.start !== false) await startCycle(db, { ...BOSS, test: false, now: THU });
}

export async function audits(db: Firestore, action?: string) {
  const snap = await db.collection('auditLog').get();
  return snap.docs.map((d) => d.data()).filter((a) => !action || a.action === action);
}
