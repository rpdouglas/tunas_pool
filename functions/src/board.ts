/**
 * The weekly board (D-102). Players post and edit under the database rules; what needs a name in
 * the audit log goes through here: hiding a post and muting a player, by the commissioner or the
 * counter role. `joinBoard` keeps the login-to-player index the rules read (`logins/{uid}`).
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseReason } from '../../shared/paperEntry';
import { auditInTransaction } from './audit';

const weekPath = (year: string, weekId: string) => `seasons/${year}/weeks/${weekId}`;

interface Actor {
  actorUid: string;
  actorRole?: 'counter';
  actorEmail?: string | null;
}

/**
 * Points this login at its player, or clears the pointer when it has none. Idempotent, and safe to
 * call on every visit: the rules re-check the live profile, so the pointer grants nothing by itself.
 */
export async function joinBoard(db: Firestore, uid: string): Promise<{ playerId: string | null }> {
  const found = await db.collection('players').where('claimedByUid', '==', uid).limit(2).get();
  const live = found.docs.filter((d) => !d.get('mergedInto'));
  const ref = db.doc(`logins/${uid}`);
  if (live.length !== 1) {
    await ref.delete();
    return { playerId: null };
  }
  const playerId = live[0].id;
  await ref.set({ playerId, updatedAt: FieldValue.serverTimestamp() });
  return { playerId };
}

/** Hides a post: the text is removed from the board and kept only in the audit log. */
export async function hideMessage(
  db: Firestore,
  input: Actor & { year: string; weekId: string; messageId: string; reason: unknown },
): Promise<{ hidden: true }> {
  const reason = parseReason(input.reason, 'hiding the post');
  if (!reason.ok) throw new HttpsError('invalid-argument', reason.message);
  const ref = db.doc(`${weekPath(input.year, input.weekId)}/board/${input.messageId}`);
  await db.runTransaction(async (tx) => {
    const message = await tx.get(ref);
    if (!message.exists) throw new HttpsError('not-found', 'That post is gone already.');
    if (message.get('hidden') === true) return;
    tx.update(ref, {
      hidden: true,
      text: '',
      hiddenAt: FieldValue.serverTimestamp(),
      hiddenBy: input.actorUid,
    });
    auditInTransaction(tx, db, {
      actorUid: input.actorUid,
      ...(input.actorRole
        ? { actorRole: input.actorRole, actorEmail: input.actorEmail ?? null }
        : {}),
      action: 'board.hidden',
      target: ref.path,
      before: {
        playerId: message.get('playerId'),
        displayName: message.get('displayName'),
        text: message.get('text'),
      },
      after: { hidden: true },
      reason: reason.value,
      year: input.year,
      weekId: input.weekId,
    });
  });
  return { hidden: true };
}

/** Mutes a player on one week's board, or lifts it. A reason is needed both ways. */
export async function setMute(
  db: Firestore,
  input: Actor & {
    year: string;
    weekId: string;
    playerId: string;
    muted: boolean;
    reason: unknown;
  },
): Promise<{ muted: boolean }> {
  const reason = parseReason(input.reason, input.muted ? 'muting them' : 'lifting the mute');
  if (!reason.ok) throw new HttpsError('invalid-argument', reason.message);
  const week = db.doc(weekPath(input.year, input.weekId));
  const muteRef = week.collection('boardMutes').doc(input.playerId);
  const playerRef = db.doc(`players/${input.playerId}`);
  await db.runTransaction(async (tx) => {
    const [weekSnap, player, mute] = await Promise.all([
      tx.get(week),
      tx.get(playerRef),
      tx.get(muteRef),
    ]);
    if (!weekSnap.exists) throw new HttpsError('not-found', 'That week does not exist.');
    if (!player.exists) throw new HttpsError('not-found', "That player isn't on the roster.");
    if (mute.exists === input.muted) return;
    if (input.muted) {
      tx.set(muteRef, {
        reason: reason.value,
        by: input.actorUid,
        at: FieldValue.serverTimestamp(),
      });
    } else {
      tx.delete(muteRef);
    }
    auditInTransaction(tx, db, {
      actorUid: input.actorUid,
      ...(input.actorRole
        ? { actorRole: input.actorRole, actorEmail: input.actorEmail ?? null }
        : {}),
      action: 'board.mute',
      target: muteRef.path,
      before: { muted: mute.exists, displayName: player.get('displayName') },
      after: { muted: input.muted, displayName: player.get('displayName') },
      reason: reason.value,
      year: input.year,
      weekId: input.weekId,
    });
  });
  return { muted: input.muted };
}
