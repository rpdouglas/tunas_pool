/**
 * The scheduled lock: at `lockAt`, set the week to locked and reveal everyone's picks. The rules
 * already reject late entry writes on their own, using the server clock (CLAUDE.md §4.4); this only
 * flips the status and the reveal. Safe to run any number of times.
 */
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { auditInTransaction } from './audit';
import { recountWeek } from './weekCounters';

export async function lockDueWeeks(db: Firestore, nowMs: number): Promise<string[]> {
  const due = await db
    .collectionGroup('weeks')
    .where('status', '==', 'open')
    .where('lockAt', '<=', Timestamp.fromMillis(nowMs))
    .get();

  const locked: string[] = [];
  for (const doc of due.docs) {
    const year = doc.ref.parent.parent!.id;
    const weekId = doc.id;
    const didLock = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      const week = fresh.data();
      if (!week || week.status !== 'open' || week.lockAt.toMillis() > nowMs) return false;
      tx.update(doc.ref, {
        status: 'locked',
        revealed: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
      auditInTransaction(tx, db, {
        actorUid: 'system:lockWeeks',
        action: 'week.status',
        target: doc.ref.path,
        before: { status: 'open', revealed: week.revealed },
        after: { status: 'locked', revealed: true },
        year,
        weekId,
      });
      return true;
    });
    if (didLock) {
      locked.push(`${year}/${weekId}`);
      await recountWeek(db, year, weekId); // a last reconcile, now that no more entries can arrive
    }
  }
  return locked;
}
