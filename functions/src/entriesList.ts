/**
 * The admin's view of a week's entries: who entered, how they say they'll pay, whether it is
 * confirmed, and any possible duplicates. One server round trip instead of a read per player,
 * which matters on a phone at the shop counter. Phone and email go to the admin only (CLAUDE.md §8).
 */
import type { Firestore } from 'firebase-admin/firestore';
import type { EntriesList, EntryRow } from '../../shared/adminTypes';
import { findDuplicateFlags, flagsByPlayer } from '../../shared/duplicates';

export async function listEntries(
  db: Firestore,
  year: string,
  weekId: string,
): Promise<EntriesList | null> {
  const weekRef = db.doc(`seasons/${year}/weeks/${weekId}`);
  const week = await weekRef.get();
  if (!week.exists) return null;

  const entries = await weekRef.collection('entries').get();
  const docs = entries.docs;
  const [payments, players] = docs.length
    ? await Promise.all([
        db.getAll(...docs.map((e) => e.ref.collection('payment').doc('current'))),
        db.getAll(...docs.map((e) => db.doc(`players/${e.id}`)), { fieldMask: ['phone', 'email'] }),
      ])
    : [[], []];

  const rows: EntryRow[] = docs.map((entry, i) => {
    const pay = payments[i];
    return {
      playerId: entry.id,
      displayName: String(entry.get('displayName') ?? ''),
      phone: (players[i].get('phone') as string | null | undefined) ?? null,
      email: (players[i].get('email') as string | null | undefined) ?? null,
      source: String(entry.get('source') ?? 'web'),
      picksSubmittedAtMs: entry.get('picksSubmittedAt')?.toMillis() ?? null,
      lateOverride: Boolean(entry.get('lateOverride')),
      paymentMethod: pay.exists ? (pay.get('paymentMethod') ?? null) : null,
      paymentIntent: pay.exists ? (pay.get('paymentIntent') ?? null) : null,
      paymentStatus: pay.exists && pay.get('paymentStatus') === 'paid' ? 'paid' : 'unpaid',
      paidAtMs: pay.exists ? (pay.get('paidAt')?.toMillis() ?? null) : null,
      record: entry.get('record') ?? null,
      duplicates: [],
    };
  });

  const flags = findDuplicateFlags(
    rows.map((r) => ({
      playerId: r.playerId,
      displayName: r.displayName,
      phone: r.phone,
      email: r.email,
    })),
  );
  const byPlayer = flagsByPlayer(
    flags,
    Object.fromEntries(rows.map((r) => [r.playerId, r.displayName])),
  );
  for (const row of rows) row.duplicates = byPlayer[row.playerId] ?? [];

  const data = week.data()!;
  return {
    year,
    weekId,
    weekNumber: data.weekNumber,
    status: data.status,
    lockAtMs: data.lockAt.toMillis(),
    entryFeeCents: data.entryFeeCents ?? 2000,
    rows,
  };
}
