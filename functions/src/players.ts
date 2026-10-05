/**
 * Deleting a player for good (D-094). Allowed only when it changes nothing anyone has seen: no weeks
 * played, no login linked, no request waiting. Everything else is refused with a plain sentence that
 * points to Inactive or a merge. The check runs again inside the transaction, so an entry added a
 * moment ago still blocks it. The audit entry keeps no phone, email, or note: only that they existed.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentReference, Firestore, Query, Transaction } from 'firebase-admin/firestore';
import type { PlayerDeleteCheck } from '../../shared/adminTypes';
import { parseReason } from '../../shared/paperEntry';
import { checkPlayerDelete, type PlayerFacts } from '../../shared/playerDelete';
import { auditInTransaction } from './audit';

/** Reads go through the transaction when there is one, so the answer matches what gets deleted. */
async function gatherFacts(
  db: Firestore,
  playerId: string,
  tx?: Transaction,
): Promise<{ facts: PlayerFacts; ref: DocumentReference; data: Record<string, unknown> }> {
  const get = (ref: DocumentReference) => (tx ? tx.get(ref) : ref.get());
  const getQuery = (query: Query) => (tx ? tx.get(query) : query.get());

  const ref = db.doc(`players/${playerId}`);
  const weekRefs = (await db.collectionGroup('weeks').select().get()).docs.map((d) => d.ref);
  const [player, entries, pending] = await Promise.all([
    get(ref),
    Promise.all(weekRefs.map((week) => get(week.collection('entries').doc(playerId)))),
    getQuery(
      db
        .collection('claims')
        .where('status', '==', 'pending')
        .where('suggestedPlayerId', '==', playerId),
    ),
  ]);
  if (!player.exists) throw new HttpsError('not-found', 'That player does not exist.');

  const data = player.data() as Record<string, unknown>;
  return {
    ref,
    data,
    facts: {
      displayName: String(data.displayName ?? 'This player'),
      origin: data.origin === 'self' ? 'self' : 'admin',
      claimed: Boolean(data.claimedByUid),
      merged: Boolean(data.mergedInto),
      weeks: entries
        .filter((entry) => entry.exists)
        .map((entry) => ({
          year: entry.ref.parent.parent!.parent.parent!.id,
          weekId: entry.ref.parent.parent!.id,
        })),
      pendingClaims: pending.size,
    },
  };
}

/** `adminDeletePlayer` with `dryRun`: can this player be deleted, and if not, why not? */
export async function inspectPlayerDelete(
  db: Firestore,
  playerId: string,
): Promise<PlayerDeleteCheck> {
  return checkPlayerDelete((await gatherFacts(db, playerId)).facts);
}

/** `adminDeletePlayer`: remove a player who has no history, with a typed reason. */
export async function deletePlayer(
  db: Firestore,
  input: { playerId: string; reason: unknown; actorUid: string },
): Promise<{ deleted: true }> {
  const { playerId, actorUid } = input;
  const parsedReason = parseReason(input.reason, 'deleting this player');
  if (!parsedReason.ok) throw new HttpsError('invalid-argument', parsedReason.message);

  return db.runTransaction(async (tx) => {
    const { facts, ref, data } = await gatherFacts(db, playerId, tx);
    const check = checkPlayerDelete(facts);
    if (!check.ok) throw new HttpsError('failed-precondition', check.message);
    const stats = await tx.get(ref.collection('stats'));

    for (const doc of stats.docs) tx.delete(doc.ref);
    tx.delete(ref);
    auditInTransaction(tx, db, {
      actorUid,
      action: 'player.delete',
      target: ref.path,
      before: {
        displayName: facts.displayName,
        origin: facts.origin,
        active: data.active !== false,
        hadPhone: Boolean(data.phone),
        hadEmail: Boolean(data.email),
        hadNote: Boolean(data.notes),
      },
      after: null,
      reason: parsedReason.value,
    });
    return { deleted: true as const };
  });
}
