/**
 * Week counters for display: how many players are in, and how many are paid (so the pot can be
 * shown). Recounted from the data every time, never incremented, so a retried trigger can't double
 * count (DECISIONS.md D-048). Locking and publishing do not rely on them.
 */
import type { Firestore } from 'firebase-admin/firestore';

export async function recountWeek(
  db: Firestore,
  year: string,
  weekId: string,
): Promise<{ entryCount: number; paidCount: number } | null> {
  const weekRef = db.doc(`seasons/${year}/weeks/${weekId}`);
  const week = await weekRef.get();
  if (!week.exists) return null;

  // select() with no fields returns only documents that exist (not "missing" parents of subcollections).
  const entries = await weekRef.collection('entries').select().get();
  const payments = entries.empty
    ? []
    : await db.getAll(...entries.docs.map((e) => e.ref.collection('payment').doc('current')), {
        fieldMask: ['paymentStatus'],
      });

  const counts = {
    entryCount: entries.size,
    paidCount: payments.filter((p) => p.exists && p.get('paymentStatus') === 'paid').length,
  };
  if (week.get('entryCount') !== counts.entryCount || week.get('paidCount') !== counts.paidCount) {
    await weekRef.update(counts); // not updatedAt: that is the admin's last edit
  }
  return counts;
}
