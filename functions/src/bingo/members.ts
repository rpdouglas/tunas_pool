/**
 * Bingo membership and settings (DATA_MODEL §11.2, §11.5): the invite code (R-14), joining with it
 * (D-115), paper members added by staff (D-114), a member's own limits (D-118), and the settings.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { changeLimit, pause, type MemberLimits } from '../../../shared/bingo';
import { auditInTransaction } from '../audit';
import {
  actorFields,
  fail,
  openCycle,
  paths,
  ts,
  type Actor,
  type MemberDoc,
  type StoredConfig,
} from './common';

/** Five wrong codes in an hour lock that login out for an hour (R-14). */
export const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 60 * 1000;

/** Codes are compared without spaces, dashes, or case, so "TUNA-6492-BINGO" and "tuna6492bingo" match. */
export const normaliseCode = (code: string) => code.replace(/[\s-]/g, '').toUpperCase();
const hashCode = (salt: string, code: string) =>
  createHash('sha256')
    .update(`${salt}:${normaliseCode(code)}`)
    .digest();

export async function setCode(
  db: Firestore,
  input: Actor & { code: unknown; now: Date },
): Promise<{ codeVersion: number }> {
  const code = typeof input.code === 'string' ? normaliseCode(input.code) : '';
  if (!/^[A-Z0-9]{8,32}$/.test(code)) {
    fail('invalid-argument', 'Use 8 to 32 letters and numbers for the code.');
  }
  return db.runTransaction(async (tx) => {
    const ref = db.doc(paths.secret);
    const before = await tx.get(ref);
    const codeVersion = ((before.get('codeVersion') as number | undefined) ?? 0) + 1;
    const salt = randomBytes(16).toString('hex');
    tx.set(ref, {
      salt,
      codeHash: hashCode(salt, code).toString('hex'),
      codeVersion,
      rotatedAt: ts(input.now),
    });
    // The code itself never goes in the log.
    auditInTransaction(tx, db, {
      ...actorFields(input),
      action: 'bingo.code',
      target: ref.path,
      before: before.exists ? { codeVersion: codeVersion - 1 } : null,
      after: { codeVersion },
    });
    return { codeVersion };
  });
}

const CONFIG_FIELDS = [
  'enabled',
  'priceCents',
  'operatorPct',
  'cutoff',
  'maxCardsPerPlayer',
  'maxWeeks',
  'joinWindowDraws',
] as const;

export function parseConfig(value: unknown): StoredConfig {
  const v = (value ?? {}) as Record<string, unknown>;
  const int = (x: unknown, lo: number, hi: number) =>
    Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;
  const cutoff = (v.cutoff ?? {}) as Record<string, unknown>;
  if (typeof v.enabled !== 'boolean') fail('invalid-argument', 'Say whether bingo is on or off.');
  if (!int(v.priceCents, 100, 100_000))
    fail('invalid-argument', 'The price must be from $1 to $1,000.');
  if (!int(v.operatorPct, 0, 100))
    fail('invalid-argument', 'The operator share must be a whole percent from 0 to 100.');
  if (
    !int(cutoff.weekday, 0, 6) ||
    typeof cutoff.time !== 'string' ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff.time) ||
    cutoff.tz !== 'America/Toronto'
  ) {
    fail('invalid-argument', 'The cutoff needs a day, a time like 18:00, and Toronto time.');
  }
  if (!int(v.maxCardsPerPlayer, 1, 5))
    fail('invalid-argument', 'Cards per person must be from 1 to 5.');
  if (!int(v.maxWeeks, 1, 52))
    fail('invalid-argument', 'The longest game must be from 1 to 52 weeks.');
  if (!int(v.joinWindowDraws, 1, 2))
    fail('invalid-argument', 'New cards can join at the first draw, or the first two.');
  return Object.fromEntries(
    CONFIG_FIELDS.map((k) => [
      k,
      k === 'cutoff' ? { weekday: cutoff.weekday, time: cutoff.time, tz: cutoff.tz } : v[k],
    ]),
  ) as unknown as StoredConfig;
}

/** Settings apply from the next game: every cycle keeps the copy it opened with. */
export async function setConfig(
  db: Firestore,
  input: Actor & { config: unknown; now: Date },
): Promise<StoredConfig> {
  const config = parseConfig(input.config);
  await db.runTransaction(async (tx) => {
    const ref = db.doc(paths.config);
    const before = await tx.get(ref);
    tx.set(ref, { ...config, updatedAt: ts(input.now), updatedBy: input.actorUid });
    auditInTransaction(tx, db, {
      ...actorFields(input),
      action: 'bingo.config',
      target: ref.path,
      before: before.exists
        ? Object.fromEntries(CONFIG_FIELDS.map((k) => [k, before.get(k) ?? null]))
        : null,
      after: config,
    });
  });
  return config;
}

function newMember(
  displayName: string,
  limit: number,
  now: Date,
  paper: boolean,
  ageAttestedAt: Date,
): MemberDoc & Record<string, unknown> {
  return {
    displayName,
    joinedAt: ts(now),
    ageAttestedAt: ts(ageAttestedAt),
    paper,
    limit,
    pendingLimit: null,
    pendingFromCycle: null,
    pausedThroughCycle: null,
    spent: { byCycle: {}, byYear: {} },
  };
}

export type RedeemResult = { joined: true; playerId: string; already: boolean };

/**
 * A player joins with the code (D-115): a saved account, a profile with the 18+ confirmation, and
 * the right code. Wrong codes are counted per login and lock it out after five in an hour (R-14).
 * `playerId` comes from the caller's `logins` pointer, refreshed by `joinBoard` first.
 */
export async function redeemCode(
  db: Firestore,
  input: { uid: string; savedAccount: boolean; playerId: string | null; code: unknown; now: Date },
): Promise<RedeemResult> {
  if (!input.savedAccount)
    fail(
      'failed-precondition',
      'Bingo needs a saved account. Save your account with Google or email first.',
    );
  if (!input.playerId)
    fail('failed-precondition', 'Add your name and confirm you’re 18 or older first.');
  const playerId = input.playerId!;
  const code = typeof input.code === 'string' ? input.code : '';
  const now = input.now.getTime();

  const outcome = await db.runTransaction(async (tx) => {
    const attemptsRef = db.doc(paths.attempts(input.uid));
    const [attempts, secret, player, member, configSnap] = await Promise.all([
      tx.get(attemptsRef),
      tx.get(db.doc(paths.secret)),
      tx.get(db.doc(`players/${playerId}`)),
      tx.get(db.doc(paths.member(playerId))),
      tx.get(db.doc(paths.config)),
    ]);
    const lockedUntil = attempts.get('lockedUntil')?.toMillis?.() as number | undefined;
    if (lockedUntil && lockedUntil > now) return { kind: 'locked' as const };
    if (!secret.exists || !configSnap.exists) return { kind: 'closed' as const };

    const salt = secret.get('salt') as string;
    const want = Buffer.from(secret.get('codeHash') as string, 'hex');
    const got = hashCode(salt, code);
    if (got.length !== want.length || !timingSafeEqual(got, want)) {
      const windowStart = attempts.get('windowStart')?.toMillis?.() as number | undefined;
      const fresh = !windowStart || now - windowStart > WINDOW_MS;
      const count = (fresh ? 0 : ((attempts.get('count') as number) ?? 0)) + 1;
      tx.set(attemptsRef, {
        count,
        windowStart: ts(fresh ? input.now : new Date(windowStart!)),
        lockedUntil: count >= MAX_ATTEMPTS ? ts(new Date(now + WINDOW_MS)) : null,
      });
      return { kind: 'wrong' as const, left: Math.max(0, MAX_ATTEMPTS - count) };
    }

    if (member.exists) return { kind: 'joined' as const, already: true };
    const attested = player.get('ageAttestedAt')?.toDate?.() as Date | undefined;
    if (!player.exists || !attested) return { kind: 'age' as const };
    const config = configSnap.data() as StoredConfig;
    const ref = db.doc(paths.member(playerId));
    tx.set(
      ref,
      newMember(
        player.get('displayName') as string,
        config.maxCardsPerPlayer,
        input.now,
        false,
        attested,
      ),
    );
    tx.delete(attemptsRef);
    auditInTransaction(tx, db, {
      actorUid: input.uid,
      action: 'bingo.memberJoined',
      target: ref.path,
      before: null,
      after: { displayName: player.get('displayName'), codeVersion: secret.get('codeVersion') },
    });
    return { kind: 'joined' as const, already: false };
  });

  switch (outcome.kind) {
    case 'locked':
      return fail(
        'resource-exhausted',
        'Too many tries. Wait an hour, or ask the commissioner for the code.',
      );
    case 'closed':
      return fail('failed-precondition', 'Bingo isn’t taking new members right now.');
    case 'wrong':
      return fail(
        'invalid-argument',
        outcome.left > 0
          ? 'That code isn’t right. Check it with whoever gave it to you.'
          : 'That code isn’t right. Too many tries: wait an hour.',
      );
    case 'age':
      return fail('failed-precondition', 'Confirm you’re 18 or older first.');
    default:
      return { joined: true, playerId, already: outcome.already };
  }
}

/** Staff add a member without a phone (D-114, D-115): their age is confirmed in person. */
export async function addMember(
  db: Firestore,
  input: Actor & { playerId: string; ageConfirmed: unknown; now: Date },
): Promise<{ playerId: string }> {
  if (input.ageConfirmed !== true)
    fail('invalid-argument', 'Confirm you checked they’re 18 or older.');
  await db.runTransaction(async (tx) => {
    const [player, member, configSnap] = await Promise.all([
      tx.get(db.doc(`players/${input.playerId}`)),
      tx.get(db.doc(paths.member(input.playerId))),
      tx.get(db.doc(paths.config)),
    ]);
    if (!player.exists || player.get('mergedInto'))
      fail('not-found', 'That player isn’t on the roster.');
    if (member.exists)
      fail('failed-precondition', `${player.get('displayName') as string} is in bingo already.`);
    if (!configSnap.exists) fail('failed-precondition', 'Bingo isn’t set up yet.');
    const config = configSnap.data() as StoredConfig;
    const ref = db.doc(paths.member(input.playerId));
    tx.set(ref, {
      ...newMember(
        player.get('displayName') as string,
        config.maxCardsPerPlayer,
        input.now,
        true,
        input.now,
      ),
      addedBy: input.actorUid,
    });
    auditInTransaction(tx, db, {
      ...actorFields(input),
      action: 'bingo.memberAdded',
      target: ref.path,
      before: null,
      after: { displayName: player.get('displayName'), paper: true, ageConfirmedInPerson: true },
    });
  });
  return { playerId: input.playerId };
}

/**
 * A member's own limit or pause (D-118). Only the member calls this; staff can't, so nobody can
 * loosen a limit for someone else. Lowering and pausing apply now; raising waits a game.
 */
export async function setLimit(
  db: Firestore,
  input: { uid: string; playerId: string; limit?: unknown; pauseCycles?: unknown; now: Date },
): Promise<MemberLimits> {
  return db.runTransaction(async (tx) => {
    const ref = db.doc(paths.member(input.playerId));
    const [member, cycle, configSnap] = await Promise.all([
      tx.get(ref),
      openCycle(tx, db),
      tx.get(db.doc(paths.config)),
    ]);
    if (!member.exists) fail('permission-denied', 'You’re not in bingo.');
    const max =
      (cycle?.data.config.maxCardsPerPlayer ?? (configSnap.get('maxCardsPerPlayer') as number)) ||
      5;
    // With no game open, a change counts from the next one.
    const number = cycle ? cycle.data.number : await nextNumber();
    const before = member.data() as MemberDoc;
    let limits: MemberLimits = {
      limit: before.limit,
      pendingLimit: before.pendingLimit,
      pendingFromCycle: before.pendingFromCycle,
      pausedThroughCycle: before.pausedThroughCycle,
    };
    if (input.limit !== undefined) {
      const r = changeLimit(limits, input.limit as number, number, max);
      if ('error' in r) return fail('invalid-argument', r.error);
      limits = r;
    }
    if (input.pauseCycles !== undefined) {
      const r = pause(limits, input.pauseCycles as number, number);
      if ('error' in r) return fail('invalid-argument', r.error);
      limits = r;
    }
    tx.update(ref, { ...limits });
    auditInTransaction(tx, db, {
      actorUid: input.uid,
      action: 'bingo.limit',
      target: ref.path,
      before: {
        limit: before.limit,
        pendingLimit: before.pendingLimit,
        pausedThroughCycle: before.pausedThroughCycle,
        displayName: before.displayName,
      },
      after: { ...limits, displayName: before.displayName },
    });
    return limits;

    async function nextNumber() {
      const last = await tx.get(db.collection('bingoCycles').orderBy('number', 'desc').limit(1));
      return last.empty ? 1 : (last.docs[0].get('number') as number) + 1;
    }
  });
}
