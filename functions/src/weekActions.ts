/**
 * The audited admin actions of the weekly job. The callables in index.ts check who is calling and
 * pass the database in; everything that decides or writes lives here, so it runs against the
 * Firestore emulator in tests (functions/src/*.int.test.ts).
 */
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { CorrectionResult, PublishedWinner, WeekPreview } from '../../shared/adminTypes';
import type { Game } from '../../shared/types';
import { auditInTransaction } from './audit';
import { evaluateWeek, writeEntryRecords, type WeekEvaluation } from './evaluate';
import { planPaymentChange, type PaymentPlan } from './payments';
import { sameResults, validateResultsInput } from './results';
import { parseReason } from '../../shared/paperEntry';
import { counterPaymentCheck } from '../../shared/counterPolicy';

const weekPath = (year: string, weekId: string) => `seasons/${year}/weeks/${weekId}`;

export interface WeekRef {
  year: string;
  weekId: string;
  actorUid: string;
  /** Set only for the counter role (D-095): its limits apply, and the audit entry names them. */
  actorRole?: 'counter';
  actorEmail?: string | null;
}

export async function setPayment(
  db: Firestore,
  input: WeekRef & { playerId: string; status: 'paid' | 'unpaid'; method?: 'cash' | 'etransfer' },
): Promise<{ changed: boolean; status: string }> {
  const { year, weekId, playerId, status, method, actorUid } = input;
  const entryRef = db.doc(`${weekPath(year, weekId)}/entries/${playerId}`);
  const paymentRef = entryRef.collection('payment').doc('current');

  return db.runTransaction(async (tx) => {
    const [entry, payment] = await Promise.all([tx.get(entryRef), tx.get(paymentRef)]);
    if (!entry.exists) throw new HttpsError('not-found', 'That player has no entry this week.');
    const existing = payment.exists
      ? {
          paymentMethod: payment.get('paymentMethod'),
          paymentIntent: payment.get('paymentIntent'),
          paymentStatus: payment.get('paymentStatus'),
        }
      : null;

    if (input.actorRole === 'counter') {
      const allowed = counterPaymentCheck(existing, { status, method });
      if (!allowed.ok) throw new HttpsError('permission-denied', allowed.message);
    }
    const plan = planPaymentChange(existing, { status, method });
    if (plan.kind === 'error') throw new HttpsError('failed-precondition', plan.message);
    if (plan.kind === 'noop')
      return { changed: false, status: existing?.paymentStatus ?? 'unpaid' };
    writePaymentPlan(tx, db, paymentRef, plan, {
      year,
      weekId,
      actorUid,
      actorRole: input.actorRole,
      actorEmail: input.actorEmail,
    });
    return { changed: true, status: plan.status };
  });
}

/**
 * Write a planned payment change and its audit entry inside a transaction. Shared by the payments
 * queue and by admin entry, where the money is often handed over with the sheet.
 */
export function writePaymentPlan(
  tx: Transaction,
  db: Firestore,
  paymentRef: DocumentReference,
  plan: Extract<PaymentPlan, { kind: 'write' }>,
  ref: WeekRef,
): void {
  const fields: Record<string, unknown> = {
    paymentMethod: plan.method,
    paymentIntent: plan.intent,
    paymentStatus: plan.status,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (plan.status === 'paid') {
    fields.paidAt = FieldValue.serverTimestamp();
    fields.paidBy = ref.actorUid;
  } else {
    fields.paidAt = FieldValue.delete();
    fields.paidBy = FieldValue.delete();
  }
  if (plan.mode === 'create') tx.set(paymentRef, fields);
  else tx.update(paymentRef, fields);

  auditInTransaction(tx, db, {
    actorUid: ref.actorUid,
    ...(ref.actorRole === 'counter'
      ? { actorRole: 'counter', actorEmail: ref.actorEmail ?? null }
      : {}),
    action: 'payment.set',
    target: paymentRef.path,
    before: plan.before ?? { paymentStatus: 'unpaid', paymentMethod: null },
    after: plan.after,
    year: ref.year,
    weekId: ref.weekId,
  });
}

export async function enterResults(
  db: Firestore,
  input: WeekRef & { results: unknown; mnfTotal: unknown },
): Promise<{ changed: boolean }> {
  const { year, weekId, actorUid } = input;
  const weekRef = db.doc(weekPath(year, weekId));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(weekRef);
    if (!snap.exists) throw new HttpsError('not-found', 'That week does not exist.');
    const week = snap.data()!;
    if (week.status === 'final') {
      throw new HttpsError(
        'failed-precondition',
        'The winner is already published, so these results are final.',
      );
    }
    if (week.status !== 'locked') {
      throw new HttpsError('failed-precondition', 'Results can be entered once picks are locked.');
    }

    const gameIds = (week.games as Game[]).map((g) => g.id);
    const valid = validateResultsInput(gameIds, input.results, input.mnfTotal ?? null);
    if (!valid.ok) throw new HttpsError('invalid-argument', valid.message);

    const before = { results: week.results ?? {}, mnfTotal: week.mnfTotal ?? null };
    if (sameResults(before.results, valid.results) && before.mnfTotal === valid.mnfTotal) {
      return { changed: false };
    }
    tx.update(weekRef, {
      results: valid.results,
      mnfTotal: valid.mnfTotal,
      updatedAt: FieldValue.serverTimestamp(),
    });
    auditInTransaction(tx, db, {
      actorUid,
      action: 'week.results',
      target: weekRef.path,
      before,
      after: { results: valid.results, mnfTotal: valid.mnfTotal },
      year,
      weekId,
    });
    return { changed: true };
  });
}

export function summarizeEvaluation(ev: WeekEvaluation): WeekPreview {
  const paid = ev.contenders.filter((c) => c.paid).length;
  return {
    status: ev.status,
    complete: ev.complete,
    gamesWithResults: ev.gamesWithResults,
    totalGames: ev.gameIds.length,
    mnfTotal: ev.mnfTotal,
    entryFeeCents: ev.entryFeeCents,
    entryCount: ev.contenders.length,
    paidCount: paid,
    potCents: paid * ev.entryFeeCents,
    unpaidEligibleToWin: ev.unpaidEligibleToWin,
    contenders: ev.contenders,
    winner: ev.winner.ok
      ? { ok: true as const, outcome: ev.winner.outcome, explanation: ev.explanation }
      : { ok: false as const, reason: ev.winner.reason },
  };
}

export async function previewWinner(
  db: Firestore,
  year: string,
  weekId: string,
): Promise<WeekPreview> {
  const evaluation = await evaluateWeek(db, year, weekId);
  if (!evaluation) throw new HttpsError('not-found', 'That week does not exist.');
  return summarizeEvaluation(evaluation);
}

/**
 * Decide the winner from the entries' own picks and payments right now, and make the week final.
 * `expectedPlayerIds` is the winner the admin reviewed. If it no longer matches (a payment or a
 * result changed in between), nothing is published (D-047).
 */
export async function publishWinner(
  db: Firestore,
  input: WeekRef & { expectedPlayerIds: string[] },
): Promise<PublishedWinner> {
  const { year, weekId, actorUid, expectedPlayerIds } = input;
  const evaluation = await evaluateWeek(db, year, weekId);
  if (!evaluation) throw new HttpsError('not-found', 'That week does not exist.');
  if (evaluation.status === 'final') {
    throw new HttpsError('failed-precondition', 'The winner is already published.');
  }
  if (evaluation.status !== 'locked') {
    throw new HttpsError(
      'failed-precondition',
      'Picks must lock before a winner can be published.',
    );
  }
  if (!evaluation.complete) {
    throw new HttpsError(
      'failed-precondition',
      `Enter all ${evaluation.gameIds.length} results and the Monday night total first.`,
    );
  }
  if (!evaluation.winner.ok) {
    throw new HttpsError(
      'failed-precondition',
      'Nobody with a paid entry can win yet. Mark payments first, then publish.',
    );
  }
  const outcome = evaluation.winner.outcome;
  const sameWinners =
    expectedPlayerIds.length === outcome.playerIds.length &&
    outcome.playerIds.every((id) => expectedPlayerIds.includes(id));
  if (!sameWinners) {
    throw new HttpsError(
      'failed-precondition',
      'The winner changed since you last looked (a payment or result changed). Review it again before publishing.',
    );
  }

  const weekRef = db.doc(weekPath(year, weekId));
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(weekRef);
    if (fresh.get('status') !== 'locked') {
      throw new HttpsError('failed-precondition', 'This week is no longer waiting for a winner.');
    }
    tx.update(weekRef, {
      winner: { ...outcome, publishedAt: FieldValue.serverTimestamp() },
      status: 'final',
      updatedAt: FieldValue.serverTimestamp(),
    });
    auditInTransaction(tx, db, {
      actorUid,
      action: 'week.winnerPublished',
      target: weekRef.path,
      before: { status: 'locked', winner: null },
      after: {
        status: 'final',
        winner: {
          playerIds: outcome.playerIds,
          displayNames: outcome.displayNames,
          record: outcome.record,
          decision: outcome.decision,
          potCents: outcome.potCents,
          shareCents: outcome.shareCents,
          leftoverCents: outcome.leftoverCents,
        },
      },
      year,
      weekId,
    });
  });
  await writeEntryRecords(db, year, weekId); // so every entry shows its final record
  return { ...outcome, explanation: evaluation.explanation };
}

export async function markPayout(
  db: Firestore,
  input: WeekRef & { sent: boolean },
): Promise<{ changed: boolean; payoutSent: boolean }> {
  const { year, weekId, actorUid, sent } = input;
  const weekRef = db.doc(weekPath(year, weekId));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(weekRef);
    if (!snap.exists) throw new HttpsError('not-found', 'That week does not exist.');
    if (snap.get('status') !== 'final' || !snap.get('winner')) {
      throw new HttpsError(
        'failed-precondition',
        'Publish the winner before recording the payout.',
      );
    }
    const before = snap.get('payoutSent') === true;
    if (before === sent) return { changed: false, payoutSent: sent };
    tx.update(weekRef, { payoutSent: sent, updatedAt: FieldValue.serverTimestamp() });
    auditInTransaction(tx, db, {
      actorUid,
      action: 'week.payout',
      target: weekRef.path,
      before: { payoutSent: before },
      after: { payoutSent: sent },
      year,
      weekId,
    });
    return { changed: true, payoutSent: sent };
  });
}

/**
 * `adminCorrectResults`: fix a result after the winner is published (PROJECT_PLAN Sprint 6). The
 * week is scored again with the same code that published it, from the entries' own picks and
 * payments. The winner is replaced if it changed, every entry's record is rewritten, and the week
 * gets a public `correctedAt` so players see a "Result corrected" note (PERSONAS: Gerald). The
 * typed reason and the before and after stay in the audit log.
 *
 * If the winner changes, "payout sent" is cleared: the money may have gone to the wrong person,
 * and the commissioner has to look at it again.
 */
export async function correctResults(
  db: Firestore,
  input: WeekRef & { results: unknown; mnfTotal: unknown; reason: unknown },
): Promise<CorrectionResult> {
  const { year, weekId, actorUid } = input;
  const reason = parseReason(input.reason, 'the correction');
  if (!reason.ok) throw new HttpsError('invalid-argument', reason.message);

  const weekRef = db.doc(weekPath(year, weekId));
  const snap = await weekRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That week does not exist.');
  if (snap.get('status') !== 'final') {
    throw new HttpsError(
      'failed-precondition',
      'Only a week with a published winner is corrected this way. Until then, just change the results.',
    );
  }
  const gameIds = ((snap.get('games') ?? []) as Game[]).map((g) => g.id);
  const valid = validateResultsInput(gameIds, input.results, input.mnfTotal ?? null);
  if (!valid.ok) throw new HttpsError('invalid-argument', valid.message);
  if (gameIds.some((id) => !valid.results[id]) || valid.mnfTotal === null) {
    throw new HttpsError(
      'invalid-argument',
      `A final week needs all ${gameIds.length} results and the Monday night total.`,
    );
  }
  const before = {
    results: (snap.get('results') ?? {}) as Record<string, string>,
    mnfTotal: (snap.get('mnfTotal') ?? null) as number | null,
  };
  if (sameResults(before.results, valid.results) && before.mnfTotal === valid.mnfTotal) {
    return { changed: false, winnerChanged: false, winner: null };
  }

  const evaluation = await evaluateWeek(db, year, weekId, {
    results: valid.results,
    mnfTotal: valid.mnfTotal,
  });
  if (!evaluation?.winner.ok) {
    throw new HttpsError(
      'failed-precondition',
      'With these results nobody with a paid entry can win. Check the payments first.',
    );
  }
  const outcome = evaluation.winner.outcome;

  const winnerChanged = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(weekRef);
    if (
      fresh.get('status') !== 'final' ||
      !sameResults(fresh.get('results'), before.results) ||
      (fresh.get('mnfTotal') ?? null) !== before.mnfTotal
    ) {
      throw new HttpsError(
        'aborted',
        'The results changed while you were working. Reload and try the correction again.',
      );
    }
    const old = (fresh.get('winner') ?? null) as {
      playerIds?: string[];
      displayNames?: string[];
      publishedAt?: unknown;
    } | null;
    const oldIds = old?.playerIds ?? [];
    const changed =
      oldIds.length !== outcome.playerIds.length ||
      !outcome.playerIds.every((id) => oldIds.includes(id));

    tx.update(weekRef, {
      results: valid.results,
      mnfTotal: valid.mnfTotal,
      winner: { ...outcome, publishedAt: old?.publishedAt ?? FieldValue.serverTimestamp() },
      correctedAt: FieldValue.serverTimestamp(),
      ...(changed ? { payoutSent: false } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    auditInTransaction(tx, db, {
      actorUid,
      action: 'week.correction',
      target: weekRef.path,
      before: {
        ...before,
        winner: { playerIds: oldIds, displayNames: old?.displayNames ?? [] },
        payoutSent: fresh.get('payoutSent') === true,
      },
      after: {
        results: valid.results,
        mnfTotal: valid.mnfTotal,
        winner: {
          playerIds: outcome.playerIds,
          displayNames: outcome.displayNames,
          record: outcome.record,
          decision: outcome.decision,
          potCents: outcome.potCents,
          shareCents: outcome.shareCents,
        },
        winnerChanged: changed,
        payoutSent: changed ? false : fresh.get('payoutSent') === true,
      },
      reason: reason.value,
      year,
      weekId,
    });
    return changed;
  });

  await writeEntryRecords(db, year, weekId);
  return {
    changed: true,
    winnerChanged,
    winner: { ...outcome, explanation: evaluation.explanation },
  };
}
