/**
 * Helpers for the integration tests (*.int.test.ts). They talk to the Firestore emulator that
 * `npm run test:rules` starts (FIRESTORE_EMULATOR_HOST is set), using the same named database as
 * production. Not part of the deployed functions.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { FIRESTORE_DATABASE_ID } from '../../shared/config';

export const PROJECT_ID = 'demo-tunas-pool';

export function testDb(): Firestore {
  const app =
    getApps().find((a) => a.name === 'int') ?? initializeApp({ projectId: PROJECT_ID }, 'int');
  return getFirestore(app, FIRESTORE_DATABASE_ID);
}

export async function clearDb(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host)
    throw new Error('Run these tests with `npm run test:rules` (needs the Firestore emulator).');
  await fetch(
    `http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents`,
    {
      method: 'DELETE',
    },
  );
}

export const GAME_IDS = [
  ...Array.from({ length: 14 }, (_, i) => `g${String(i + 1).padStart(2, '0')}`),
  'mnf',
];
const TEAMS = [
  'Jaguars',
  'Rams',
  'Colts',
  'Commanders',
  'Bills',
  'Dolphins',
  'Ravens',
  'Bengals',
  'Browns',
  'Steelers',
  'Texans',
  'Titans',
  'Broncos',
  'Raiders',
  'Cowboys',
  'Giants',
  'Eagles',
  'Bears',
  'Lions',
  'Packers',
  'Vikings',
  'Falcons',
  'Panthers',
  'Saints',
  'Buccaneers',
  'Cardinals',
  '49ers',
  'Seahawks',
  'Chiefs',
  'Chargers',
];

export const YEAR = '2026';
export const WEEK = 'wk01';
export const weekPath = (weekId = WEEK, year = YEAR) => `seasons/${year}/weeks/${weekId}`;
const hoursFromNow = (h: number) => Timestamp.fromMillis(Date.now() + h * 3_600_000);

export async function seedWeek(
  db: Firestore,
  options: {
    status?: string;
    lockInHours?: number;
    weekId?: string;
    extra?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const { status = 'locked', lockInHours = -1, weekId = WEEK, extra = {} } = options;
  const games = GAME_IDS.map((id, i) => ({
    id,
    order: i + 1,
    away: TEAMS[i * 2],
    home: TEAMS[i * 2 + 1],
    kickoff: hoursFromNow(lockInHours + 12),
    slot: id === 'mnf' ? 'mnf' : 'sunday',
  }));
  await db.doc(weekPath(weekId)).set({
    weekNumber: Number(weekId.slice(2)),
    status,
    lockAt: hoursFromNow(lockInHours),
    revealed: status !== 'open' && status !== 'draft',
    games,
    mnfGameId: 'mnf',
    results: {},
    mnfTotal: null,
    entryFeeCents: 2000,
    entryCount: 0,
    paidCount: 0,
    winner: null,
    payoutSent: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...extra,
  });
}

/** The first `wins` games are picked home, the rest away, so against all-home results the record is wins - (15 - wins). */
export function picksWithWins(wins: number): Record<string, 'home' | 'away'> {
  return Object.fromEntries(GAME_IDS.map((id, i) => [id, i < wins ? 'home' : 'away']));
}

export const ALL_HOME: Record<string, 'home'> = Object.fromEntries(
  GAME_IDS.map((id) => [id, 'home' as const]),
);

export async function seedEntry(
  db: Firestore,
  playerId: string,
  options: {
    name?: string;
    wins?: number;
    guess?: number | null;
    payment?: 'paid' | 'unpaid' | null;
    method?: 'cash' | 'etransfer';
    phone?: string | null;
    weekId?: string;
  } = {},
): Promise<void> {
  const {
    name = playerId.toUpperCase(),
    wins = 8,
    guess = 40,
    payment = 'unpaid',
    method = 'cash',
    phone = null,
    weekId = WEEK,
  } = options;
  const ref = db.doc(`${weekPath(weekId)}/entries/${playerId}`);
  await db.doc(`players/${playerId}`).set({
    displayName: name,
    phone,
    email: null,
    claimedByUid: playerId,
    origin: 'self',
    usualPayment: null,
    active: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  await ref.set({
    playerId,
    displayName: name,
    enteredBy: 'self',
    source: 'web',
    paperPhotoPath: null,
    lateOverride: null,
    picksSubmittedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  if (payment) {
    await ref.collection('payment').doc('current').set({
      paymentMethod: method,
      paymentIntent: 'will_do',
      paymentStatus: payment,
      updatedAt: Timestamp.now(),
    });
  }
  await ref
    .collection('private')
    .doc('picks')
    .set({
      picks: picksWithWins(wins),
      tiebreakerTotal: guess ?? 0,
      updatedAt: Timestamp.now(),
      ...(guess === null ? { tiebreakerTotal: null } : {}),
    });
}
