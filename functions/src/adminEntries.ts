/**
 * Entering picks for someone (paper sheet, text, or phone call), late entries, and removing an
 * entry (PROJECT_PLAN Sprint 4). The callables in index.ts check who is calling and pass the
 * database in. Every one of these writes the audit log (CLAUDE.md §4.5).
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { entryWindow, parseAdminEntry, parseReason } from '../../shared/paperEntry';
import type { Game } from '../../shared/types';
import { auditInTransaction } from './audit';
import { writeEntryRecords } from './evaluate';
import { planPaymentChange } from './payments';
import { writePaymentPlan, type WeekRef } from './weekActions';

const weekPath = (year: string, weekId: string) => `seasons/${year}/weeks/${weekId}`;

export interface UpsertResult {
  created: boolean;
  late: boolean;
  paid: boolean;
  picksSubmittedAtMs: number | null;
}

/**
 * Enter or replace a player's picks. `late: false` is `adminUpsertEntry`: only while the week is
 * open and the lock time is ahead, by the server clock, or while a backfilled week is locked (D-071). `late: true` is `adminLateOverride`: only
 * once picks are locked and before the winner is published, with a typed reason that stays on the
 * entry as a badge.
 */
export async function upsertEntry(
  db: Firestore,
  input: WeekRef & {
    playerId: string;
    entry: unknown;
    late: boolean;
    reason?: unknown;
    nowMs: number;
  },
): Promise<UpsertResult> {
  const { year, weekId, playerId, actorUid, late } = input;
  const weekRef = db.doc(weekPath(year, weekId));
  const playerRef = db.doc(`players/${playerId}`);
  const entryRef = weekRef.collection('entries').doc(playerId);
  const picksRef = entryRef.collection('private').doc('picks');
  const paymentRef = entryRef.collection('payment').doc('current');

  const result = await db.runTransaction(async (tx) => {
    const [week, player, entry, picks, payment] = await Promise.all(
      [weekRef, playerRef, entryRef, picksRef, paymentRef].map((ref) => tx.get(ref)),
    );
    if (!week.exists) throw new HttpsError('not-found', 'That week does not exist.');

    const window = entryWindow(
      {
        status: week.get('status'),
        lockAtMs: week.get('lockAt').toMillis(),
        backfilled: week.get('backfilled') === true,
      },
      input.nowMs, // the server clock decides (CLAUDE.md §4.4)
    );
    if (window.mode === 'closed') throw new HttpsError('failed-precondition', window.message);
    if (!late && window.mode === 'late') {
      throw new HttpsError(
        'failed-precondition',
        'Picks are locked. After the lock, an entry needs a late-entry reason.',
      );
    }
    if (late && window.mode === 'backfill') {
      throw new HttpsError(
        'failed-precondition',
        "This week was backfilled, so its sheets don't need a late-entry reason. Save it as a normal entry.",
      );
    }
    if (late && window.mode === 'open') {
      throw new HttpsError(
        'failed-precondition',
        "Picks haven't locked yet, so this doesn't need a late-entry reason. Save it as a normal entry.",
      );
    }

    if (!player.exists) throw new HttpsError('not-found', "That player isn't on the roster.");
    if (player.get('mergedInto')) {
      throw new HttpsError(
        'failed-precondition',
        'That profile was merged into another one. Enter the picks for the other profile.',
      );
    }
    if (player.get('active') === false) {
      throw new HttpsError(
        'failed-precondition',
        'That player is marked inactive. Make them active on the roster first.',
      );
    }

    const gameIds = ((week.get('games') ?? []) as Game[]).map((g) => g.id);
    const parsed = parseAdminEntry(input.entry, { year, weekId, gameIds });
    if (!parsed.ok) throw new HttpsError('invalid-argument', parsed.message);
    const sheet = parsed.value;

    let reason: string | undefined;
    if (late) {
      const parsedReason = parseReason(input.reason, 'the late entry');
      if (!parsedReason.ok) throw new HttpsError('invalid-argument', parsedReason.message);
      reason = parsedReason.value;
    }

    const displayName = String(player.get('displayName') ?? '');
    const shared = {
      displayName,
      source: sheet.source,
      paperPhotoPath: sheet.paperPhotoPath,
      picksSubmittedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(late ? { lateOverride: { reason, by: actorUid, at: FieldValue.serverTimestamp() } } : {}),
    };
    if (entry.exists) {
      tx.update(entryRef, shared);
    } else {
      tx.set(entryRef, {
        playerId,
        enteredBy: 'admin',
        lateOverride: null,
        createdAt: FieldValue.serverTimestamp(),
        ...shared,
      });
    }
    tx.set(picksRef, {
      picks: sheet.picks,
      tiebreakerTotal: sheet.tiebreakerTotal,
      updatedAt: FieldValue.serverTimestamp(),
    });

    let paid = payment.exists && payment.get('paymentStatus') === 'paid';
    if (sheet.markPaid) {
      const existing = payment.exists
        ? {
            paymentMethod: payment.get('paymentMethod'),
            paymentIntent: payment.get('paymentIntent'),
            paymentStatus: payment.get('paymentStatus'),
          }
        : null;
      const plan = planPaymentChange(existing, { status: 'paid', method: sheet.markPaid });
      if (plan.kind === 'error') throw new HttpsError('failed-precondition', plan.message);
      if (plan.kind === 'write') writePaymentPlan(tx, db, paymentRef, plan, input);
      paid = true;
    }

    auditInTransaction(tx, db, {
      actorUid,
      action: late ? 'entry.lateOverride' : 'entry.adminUpsert',
      target: entryRef.path,
      before: entry.exists
        ? {
            source: entry.get('source'),
            enteredBy: entry.get('enteredBy'),
            paperPhotoPath: entry.get('paperPhotoPath') ?? null,
            lateOverride: Boolean(entry.get('lateOverride')),
            picks: picks.get('picks') ?? {},
            tiebreakerTotal: picks.get('tiebreakerTotal') ?? null,
          }
        : null,
      after: {
        displayName,
        source: sheet.source,
        paperPhotoPath: sheet.paperPhotoPath,
        lateOverride: late || Boolean(entry.get('lateOverride')),
        picks: sheet.picks,
        tiebreakerTotal: sheet.tiebreakerTotal,
      },
      reason,
      year,
      weekId,
    });

    const hasResults = Object.keys(week.get('results') ?? {}).length > 0;
    return { created: !entry.exists, late, paid, hasResults };
  });

  // Results that are already in give the late entry its record straight away.
  if (result.hasResults) await writeEntryRecords(db, year, weekId);
  const saved = await entryRef.get();
  return {
    created: result.created,
    late: result.late,
    paid: result.paid,
    picksSubmittedAtMs: saved.get('picksSubmittedAt')?.toMillis() ?? null,
  };
}

/**
 * Remove an entry, with a typed reason. A paid entry stays until the payment is undone, so the pot
 * never changes without its own audit entry. Not after the winner is published.
 */
export async function deleteEntry(
  db: Firestore,
  input: WeekRef & { playerId: string; reason: unknown },
): Promise<{ deleted: true }> {
  const { year, weekId, playerId, actorUid } = input;
  const parsedReason = parseReason(input.reason, 'removing this entry');
  if (!parsedReason.ok) throw new HttpsError('invalid-argument', parsedReason.message);

  const weekRef = db.doc(weekPath(year, weekId));
  const entryRef = weekRef.collection('entries').doc(playerId);
  const picksRef = entryRef.collection('private').doc('picks');
  const paymentRef = entryRef.collection('payment').doc('current');

  return db.runTransaction(async (tx) => {
    const [week, entry, picks, payment] = await Promise.all(
      [weekRef, entryRef, picksRef, paymentRef].map((ref) => tx.get(ref)),
    );
    if (!week.exists) throw new HttpsError('not-found', 'That week does not exist.');
    if (week.get('status') === 'final') {
      throw new HttpsError(
        'failed-precondition',
        'The winner is published, so entries for this week can no longer be removed.',
      );
    }
    if (!entry.exists) throw new HttpsError('not-found', 'That player has no entry this week.');
    if (payment.exists && payment.get('paymentStatus') === 'paid') {
      throw new HttpsError(
        'failed-precondition',
        'This entry is marked paid. Undo the payment first, then remove the entry.',
      );
    }

    tx.delete(picksRef);
    tx.delete(paymentRef);
    tx.delete(entryRef);
    auditInTransaction(tx, db, {
      actorUid,
      action: 'entry.delete',
      target: entryRef.path,
      before: {
        displayName: entry.get('displayName'),
        enteredBy: entry.get('enteredBy'),
        source: entry.get('source'),
        paperPhotoPath: entry.get('paperPhotoPath') ?? null,
        lateOverride: Boolean(entry.get('lateOverride')),
        picks: picks.get('picks') ?? {},
        tiebreakerTotal: picks.get('tiebreakerTotal') ?? null,
        payment: payment.exists
          ? {
              paymentMethod: payment.get('paymentMethod'),
              paymentIntent: payment.get('paymentIntent'),
              paymentStatus: payment.get('paymentStatus'),
            }
          : null,
      },
      after: null,
      reason: parsedReason.value,
      year,
      weekId,
    });
    return { deleted: true as const };
  });
}
