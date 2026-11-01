/**
 * Reopen picks (D-145): a locked week goes back to open with a new lock time and a typed reason,
 * before any result is in. Picks are hidden again (`revealed: false`) until the new lock, when the
 * scheduled lock (lockWeeks) locks and reveals the week as usual. Audit logged as `week.reopen`.
 */
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseReason } from '../../shared/paperEntry';
import type { Game } from '../../shared/types';
import { auditInTransaction } from './audit';
import { isSeasonArchived } from './seasons';
import { planReopen, toGameDraft } from './weekStatus';

const weekPath = (year: string, weekId: string) => `seasons/${year}/weeks/${weekId}`;

export async function reopenWeek(
  db: Firestore,
  input: {
    year: string;
    weekId: string;
    lockAtMs: unknown;
    reason: unknown;
    actorUid: string;
    nowMs?: number;
  },
): Promise<{ status: 'open'; lockAtMs: number }> {
  const reason = parseReason(input.reason, 'reopening picks');
  if (!reason.ok) throw new HttpsError('invalid-argument', reason.message);
  if (await isSeasonArchived(db, input.year)) {
    throw new HttpsError(
      'failed-precondition',
      "This season is archived, so a week can't be reopened in it. Reopen the season from Seasons first.",
    );
  }

  const weekRef = db.doc(weekPath(input.year, input.weekId));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(weekRef);
    if (!snap.exists) throw new HttpsError('not-found', 'That week does not exist.');
    const week = snap.data()!;
    const plan = planReopen(
      {
        status: week.status,
        lockAtMs: week.lockAt.toMillis(),
        games: (week.games as Game[]).map(toGameDraft),
        mnfGameId: week.mnfGameId,
        backfilled: week.backfilled === true,
        resultCount: Object.keys(week.results ?? {}).length,
        mnfTotal: week.mnfTotal ?? null,
        hasWinner: Boolean(week.winner),
      },
      input.lockAtMs,
      input.nowMs ?? Date.now(), // the server clock decides (CLAUDE.md §4.4)
    );
    if (!plan.ok) throw new HttpsError(plan.code, plan.message);

    const lockAt = Timestamp.fromMillis(plan.update.lockAtMs);
    tx.update(weekRef, {
      status: 'open',
      revealed: false,
      lockAt,
      updatedAt: FieldValue.serverTimestamp(),
    });
    auditInTransaction(tx, db, {
      actorUid: input.actorUid,
      action: 'week.reopen',
      target: weekRef.path,
      before: { status: week.status, revealed: week.revealed, lockAt: week.lockAt },
      after: { status: 'open', revealed: false, lockAt },
      reason: reason.value,
      year: input.year,
      weekId: input.weekId,
    });
    return { status: 'open' as const, lockAtMs: plan.update.lockAtMs };
  });
}
