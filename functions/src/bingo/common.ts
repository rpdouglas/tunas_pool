/**
 * Tunas 649 Bingo: what every bingo function shares (DATA_MODEL §11). The rules of the game are
 * in shared/bingo.ts; these modules read and write Firestore around them, always in a transaction,
 * and write the audit log in the same transaction (CLAUDE.md principle 5). Every function takes
 * `now`, so the integration tests can run on real Wednesdays.
 */
import {
  Timestamp,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { addDays } from '../../../shared/time';
import { cutoffAt, type BingoCycleConfig } from '../../../shared/bingo';
import type { AuditInput } from '../audit';

export interface Actor {
  actorUid: string;
  actorRole?: 'counter';
  actorEmail?: string | null;
}

/** The audit fields for an actor; only the counter adds its role and email (D-095). */
export const actorFields = (a: Actor): Pick<AuditInput, 'actorUid' | 'actorRole' | 'actorEmail'> =>
  a.actorRole
    ? { actorUid: a.actorUid, actorRole: a.actorRole, actorEmail: a.actorEmail ?? null }
    : { actorUid: a.actorUid };

export const isCounter = (a: Actor) => a.actorRole === 'counter';

export const paths = {
  config: 'bingo/config',
  secret: 'bingo/secret',
  member: (playerId: string) => `bingoMembers/${playerId}`,
  attempts: (uid: string) => `bingoRedeemAttempts/${uid}`,
  card: (cardId: string) => `bingoCards/${cardId}`,
  cycle: (cycleId: string) => `bingoCycles/${cycleId}`,
  entry: (cycleId: string, cardId: string) => `bingoCycles/${cycleId}/entries/${cardId}`,
  draw: (cycleId: string, drawDate: string) => `bingoCycles/${cycleId}/draws/${drawDate}`,
  payment: (cycleId: string, drawDate: string, cardId: string) =>
    `bingoCycles/${cycleId}/draws/${drawDate}/payments/${cardId}`,
};

export const fail = (
  code:
    | 'invalid-argument'
    | 'failed-precondition'
    | 'not-found'
    | 'permission-denied'
    | 'resource-exhausted',
  message: string,
): never => {
  throw new HttpsError(code, message);
};

export interface StoredConfig extends BingoCycleConfig {
  enabled: boolean;
}

export async function readConfig(tx: Transaction, db: Firestore): Promise<StoredConfig> {
  const snap = await tx.get(db.doc(paths.config));
  if (!snap.exists)
    fail(
      'failed-precondition',
      'Bingo isn’t set up yet. The commissioner sets it up under Settings.',
    );
  return snap.data() as StoredConfig;
}

export interface CycleDoc {
  number: number;
  status: 'open' | 'won' | 'capped';
  test: boolean;
  firstDraw: string;
  config: BingoCycleConfig;
  potCents: number;
  operatorCents: number;
  drawsApproved: number;
  board: { at3: number; at4: number; at5: number; cards: number };
  carriedInCents: number;
  carriedOutCents?: number;
  closingDraw?: string | null;
  winners?: Winner[];
}

export interface Winner {
  cardId: string;
  playerId: string;
  displayName: string;
  hits: number;
  shareCents: number;
  paidOut: { method: 'cash' | 'etransfer'; at: Timestamp; by: string } | null;
}

/** The one open cycle, or null. */
export async function openCycle(
  tx: Transaction,
  db: Firestore,
): Promise<{ id: string; ref: DocumentReference; data: CycleDoc } | null> {
  const snap = await tx.get(db.collection('bingoCycles').where('status', '==', 'open').limit(2));
  if (snap.size > 1)
    fail(
      'failed-precondition',
      'More than one game is open. Ask the commissioner to check the records.',
    );
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ref: doc.ref, data: doc.data() as CycleDoc };
}

export async function requireOpenCycle(tx: Transaction, db: Firestore) {
  const c = await openCycle(tx, db);
  if (!c) fail('failed-precondition', 'No game is open right now.');
  return c!;
}

export interface DrawDoc {
  status: 'upcoming' | 'proposed' | 'approved' | 'skipped';
  cutoffAt: Timestamp;
  numbers: number[] | null;
}

/** All draw documents of a cycle, by date. */
export async function readDraws(tx: Transaction, db: Firestore, cycleId: string) {
  const snap = await tx.get(db.collection(`${paths.cycle(cycleId)}/draws`));
  return new Map(snap.docs.map((d) => [d.id, d.data() as DrawDoc]));
}

/** Draws already approved, and skipped, in a cycle. */
export function closedDraws(draws: Map<string, DrawDoc>) {
  const approved = new Set<string>();
  const skipped = new Set<string>();
  for (const [date, d] of draws) {
    if (d.status === 'approved') approved.add(date);
    if (d.status === 'skipped') skipped.add(date);
  }
  return { approved, skipped };
}

/** The draw money is due for now: the cycle's earliest draw that isn't approved or skipped. */
export function dueDraw(firstDraw: string, draws: Map<string, DrawDoc>): string {
  let d = firstDraw;
  while (draws.get(d)?.status === 'approved' || draws.get(d)?.status === 'skipped')
    d = addDays(d, 7);
  return d;
}

/** A new draw document, `upcoming`, with its cutoff. */
export function newDraw(drawDate: string, config: BingoCycleConfig) {
  return {
    status: 'upcoming' as const,
    cutoffAt: Timestamp.fromDate(cutoffAt(drawDate, config.cutoff)),
    numbers: null,
    source: null,
    proposedBy: null,
    proposedAt: null,
    approvedBy: null,
    approvedAt: null,
    correction: null,
    paidCards: 0,
    revenueCents: 0,
    operatorCents: 0,
    potAddCents: 0,
  };
}

export interface MemberDoc {
  displayName: string;
  paper: boolean;
  limit: number;
  pendingLimit: number | null;
  pendingFromCycle: number | null;
  pausedThroughCycle: number | null;
  spent: { byCycle: Record<string, number>; byYear: Record<string, number> };
}

export async function requireMember(tx: Transaction, db: Firestore, playerId: string) {
  const snap = await tx.get(db.doc(paths.member(playerId)));
  if (!snap.exists) fail('permission-denied', 'That player isn’t in bingo.');
  return { ref: snap.ref, data: snap.data() as MemberDoc };
}

/** The year a payment counts toward, in Toronto. */
export const yearOf = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric' }).format(d);

export const ts = (d: Date) => Timestamp.fromDate(d);
