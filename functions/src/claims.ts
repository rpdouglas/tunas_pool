/**
 * Claims and merges (PROJECT_PLAN Sprint 5): linking a login to a profile the pool already has,
 * undoing that, and folding two profiles for one person together. The callables in index.ts check
 * who is calling and pass the database in. Every decision is audit logged (CLAUDE.md §4.5), and no
 * claim is ever approved automatically (CLAUDE.md §8, D-004).
 */
import {
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type {
  ApproveClaimResult,
  ClaimRow,
  ClaimsList,
  MergeResult,
} from '../../shared/adminTypes';
import {
  claimGate,
  mergeConflicts,
  parseClaimRequest,
  parseDecisionNote,
  rankClaimCandidates,
  suggestedCandidate,
  type ClaimablePlayer,
} from '../../shared/claims';
import { auditInTransaction } from './audit';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `requestClaim`: a signed-in player asks to be linked to their history. The answer is the same
 * whoever they name, and the stored claim holds only what they typed, so asking reveals nothing
 * about anyone's profile (PERSONAS anti-persona E).
 */
export async function requestClaim(
  db: Firestore,
  input: { uid: string; email: string | null; isGuest: boolean; data: unknown; nowMs: number },
): Promise<{ status: 'pending' }> {
  const parsed = parseClaimRequest(input.data);
  if (!parsed.ok) throw new HttpsError('invalid-argument', parsed.message);

  await db.runTransaction(async (tx) => {
    const [mine, profiles] = await Promise.all([
      tx.get(db.collection('claims').where('requesterUid', '==', input.uid)),
      tx.get(db.collection('players').where('claimedByUid', '==', input.uid)),
    ]);
    const gate = claimGate({
      isGuest: input.isGuest,
      linkedToRoster: profiles.docs.some((p) => p.get('origin') === 'admin'),
      claims: mine.docs
        .map((c) => ({
          status: String(c.get('status')),
          createdAtMs: c.get('createdAt')?.toMillis() ?? input.nowMs,
        }))
        .filter((c) => c.status === 'pending' || input.nowMs - c.createdAtMs < DAY_MS),
      nowMs: input.nowMs,
    });
    if (!gate.ok) {
      throw new HttpsError(
        gate.code === 'too_many' ? 'resource-exhausted' : 'failed-precondition',
        gate.message,
      );
    }
    tx.create(db.collection('claims').doc(), {
      requesterUid: input.uid,
      requesterEmail: input.email,
      claimedName: parsed.value.claimedName,
      claimedPhone: parsed.value.claimedPhone,
      status: 'pending',
      suggestedPlayerId: null, // never stored: the claimant can read this document
      resolvedPlayerId: null,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { status: 'pending' };
}

/** Every week of every season, for looking up one player's entries. Small: about 20 a season. */
async function allWeekRefs(db: Firestore): Promise<DocumentReference[]> {
  return (await db.collectionGroup('weeks').select().get()).docs.map((d) => d.ref);
}

/** "2026/wk03" for a week reference. */
const weekKey = (ref: DocumentReference) => `${ref.parent.parent!.id}/${ref.id}`;

/** `adminListClaims`: the pending requests, each with who is asking and the likely matches. */
export async function listClaims(db: Firestore): Promise<ClaimsList> {
  const [pending, players, weekRefs] = await Promise.all([
    db.collection('claims').where('status', '==', 'pending').get(),
    db.collection('players').get(),
    allWeekRefs(db),
  ]);
  const live = players.docs.filter((p) => !p.get('mergedInto'));
  const claimable: ClaimablePlayer[] = live.map((p) => ({
    playerId: p.id,
    displayName: String(p.get('displayName') ?? ''),
    phone: (p.get('phone') as string | null | undefined) ?? null,
    linked: Boolean(p.get('claimedByUid')),
    active: p.get('active') !== false,
  }));

  const drafts = pending.docs
    .map((claim) => {
      const requesterUid = String(claim.get('requesterUid'));
      const own = live.filter((p) => p.get('claimedByUid') === requesterUid);
      const request = {
        claimedName: String(claim.get('claimedName') ?? ''),
        claimedPhone: (claim.get('claimedPhone') as string | null | undefined) ?? null,
      };
      const candidates = rankClaimCandidates(
        request,
        // A profile made on the website belongs to whoever made it; only roster profiles are claimed.
        claimable.filter((c) => live.find((p) => p.id === c.playerId)?.get('origin') === 'admin'),
        own.map((p) => p.id),
      );
      return { claim, request, own: own[0] ?? null, candidates };
    })
    .sort(
      (a, b) =>
        (a.claim.get('createdAt')?.toMillis() ?? 0) - (b.claim.get('createdAt')?.toMillis() ?? 0),
    );

  // How many weeks each profile on the screen has played, in one read.
  const ids = [
    ...new Set(
      drafts.flatMap((d) => [...d.candidates.map((c) => c.playerId), ...(d.own ? [d.own.id] : [])]),
    ),
  ];
  const weeksPlayed = new Map<string, number>(ids.map((id) => [id, 0]));
  if (ids.length > 0 && weekRefs.length > 0) {
    const entryRefs = weekRefs.flatMap((w) => ids.map((id) => w.collection('entries').doc(id)));
    const snaps = await db.getAll(...entryRefs, { fieldMask: ['playerId'] });
    for (const snap of snaps) {
      if (snap.exists) weeksPlayed.set(snap.id, (weeksPlayed.get(snap.id) ?? 0) + 1);
    }
  }

  const suggestions = drafts.map((d) => suggestedCandidate(d.candidates));
  const claims: ClaimRow[] = drafts.map((d, i) => ({
    claimId: d.claim.id,
    claimedName: d.request.claimedName,
    claimedPhone: d.request.claimedPhone,
    requesterEmail: (d.claim.get('requesterEmail') as string | null | undefined) ?? null,
    createdAtMs: d.claim.get('createdAt')?.toMillis() ?? 0,
    requesterProfile: d.own
      ? {
          playerId: d.own.id,
          displayName: String(d.own.get('displayName') ?? ''),
          weeksPlayed: weeksPlayed.get(d.own.id) ?? 0,
        }
      : null,
    candidates: d.candidates.map((c) => ({ ...c, weeksPlayed: weeksPlayed.get(c.playerId) ?? 0 })),
    suggestedPlayerId: suggestions[i],
    sharedSuggestion:
      suggestions[i] !== null && suggestions.filter((s) => s === suggestions[i]).length > 1,
  }));
  return { claims };
}

/**
 * Move every entry of `fromId` to `intoId` inside a transaction, and retire the `from` profile.
 * Entry documents are keyed by player (CLAUDE.md §4.2), so a move is a copy under the new ID and a
 * delete of the old one, with the picks and payment documents beside it. A published winner that
 * names the old ID is repointed. Refused if both profiles entered the same week.
 *
 * All reads happen before any write, as Firestore transactions require.
 */
async function mergeInTransaction(
  tx: Transaction,
  input: {
    from: DocumentSnapshot;
    into: DocumentSnapshot;
    weekRefs: DocumentReference[];
  },
): Promise<{ movedWeeks: string[]; write: () => void }> {
  const { from, into, weekRefs } = input;
  const perWeek = await Promise.all(
    weekRefs.map(async (weekRef) => {
      const fromEntry = weekRef.collection('entries').doc(from.id);
      const intoEntry = weekRef.collection('entries').doc(into.id);
      const [week, entry, picks, payment, other] = await Promise.all([
        tx.get(weekRef),
        tx.get(fromEntry),
        tx.get(fromEntry.collection('private').doc('picks')),
        tx.get(fromEntry.collection('payment').doc('current')),
        tx.get(intoEntry),
      ]);
      return { weekRef, week, entry, picks, payment, other, intoEntry };
    }),
  );

  const conflicts = mergeConflicts(
    perWeek.filter((w) => w.entry.exists).map((w) => weekKey(w.weekRef)),
    perWeek.filter((w) => w.other.exists).map((w) => weekKey(w.weekRef)),
  );
  if (conflicts.length > 0) {
    const names = conflicts.map((key) => {
      const [year, weekId] = key.split('/');
      return `week ${Number(weekId.replace(/\D/g, ''))} of ${year}`;
    });
    throw new HttpsError(
      'failed-precondition',
      `Both profiles have an entry in ${names.join(', ')}. One person gets one entry a week, so remove one of them first, then try again.`,
    );
  }

  const moving = perWeek.filter((w) => w.entry.exists);
  const intoName = String(into.get('displayName') ?? '');
  const repoint = (ids: unknown) =>
    Array.isArray(ids) ? ids.map((id) => (id === from.id ? into.id : id)) : ids;

  return {
    movedWeeks: moving.map((w) => weekKey(w.weekRef)),
    write: () => {
      for (const w of moving) {
        tx.set(w.intoEntry, { ...w.entry.data()!, playerId: into.id, displayName: intoName });
        if (w.picks.exists) tx.set(w.intoEntry.collection('private').doc('picks'), w.picks.data()!);
        if (w.payment.exists) {
          tx.set(w.intoEntry.collection('payment').doc('current'), w.payment.data()!);
        }
        tx.delete(w.picks.ref);
        tx.delete(w.payment.ref);
        tx.delete(w.entry.ref);

        const winner = w.week.get('winner') as {
          playerIds?: string[];
          tiedPlayerIds?: string[];
          displayNames?: string[];
        } | null;
        if (winner?.playerIds?.includes(from.id) || winner?.tiedPlayerIds?.includes(from.id)) {
          const index = winner.playerIds?.indexOf(from.id) ?? -1;
          const displayNames = [...(winner.displayNames ?? [])];
          if (index >= 0) displayNames[index] = intoName;
          tx.update(w.weekRef, {
            'winner.playerIds': repoint(winner.playerIds),
            'winner.tiedPlayerIds': repoint(winner.tiedPlayerIds),
            'winner.displayNames': displayNames,
          });
        }
      }
      // The old profile stays as a record of the merge, with no login, so a login has one profile.
      tx.update(from.ref, {
        mergedInto: into.id,
        claimedByUid: null,
        active: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
    },
  };
}

function requireLiveProfile(snap: DocumentSnapshot, what: string): void {
  if (!snap.exists) throw new HttpsError('not-found', `${what} isn't on the roster.`);
  if (snap.get('mergedInto')) {
    throw new HttpsError('failed-precondition', `${what} was already merged into another profile.`);
  }
}

/**
 * `adminApproveClaim`: link the claimant's login to the roster profile. If the claimant already
 * has a profile from entering on the website, it is merged into the roster profile first, so their
 * website weeks and their paper weeks become one history.
 */
export async function approveClaim(
  db: Firestore,
  input: { claimId: string; playerId: string; actorUid: string },
): Promise<ApproveClaimResult> {
  const { claimId, playerId, actorUid } = input;
  const claimRef = db.doc(`claims/${claimId}`);
  const targetRef = db.doc(`players/${playerId}`);
  const weekRefs = await allWeekRefs(db);

  return db.runTransaction(async (tx) => {
    const [claim, target] = await Promise.all([tx.get(claimRef), tx.get(targetRef)]);
    if (!claim.exists) throw new HttpsError('not-found', 'That request no longer exists.');
    if (claim.get('status') !== 'pending') {
      throw new HttpsError('failed-precondition', 'That request was already decided.');
    }
    requireLiveProfile(target, 'That player');
    if (target.get('origin') !== 'admin') {
      throw new HttpsError(
        'failed-precondition',
        'That profile was made by a player on the website, so it already belongs to their login. To join two profiles, merge them from the roster.',
      );
    }
    const requesterUid = String(claim.get('requesterUid'));
    if (target.get('claimedByUid')) {
      throw new HttpsError(
        'failed-precondition',
        target.get('claimedByUid') === requesterUid
          ? 'That player is already linked to this login.'
          : 'That player is already linked to a login. Unlink it from the roster first if that was a mistake.',
      );
    }

    const own = await tx.get(db.collection('players').where('claimedByUid', '==', requesterUid));
    if (own.docs.some((p) => p.get('origin') === 'admin')) {
      throw new HttpsError(
        'failed-precondition',
        'This login is already linked to another roster player. Unlink that one first.',
      );
    }
    const selfProfile = own.docs[0] ?? null;
    const merge = selfProfile
      ? await mergeInTransaction(tx, { from: selfProfile, into: target, weekRefs })
      : null;

    merge?.write();
    tx.update(targetRef, {
      claimedByUid: requesterUid,
      // A profile retired on the roster comes back when its owner claims it.
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(claimRef, {
      status: 'approved',
      resolvedPlayerId: playerId,
      decidedBy: actorUid,
      decidedAt: FieldValue.serverTimestamp(),
    });
    auditInTransaction(tx, db, {
      actorUid,
      action: 'claim.approved',
      target: targetRef.path,
      before: { claimedByUid: null },
      after: {
        claimedByUid: requesterUid,
        claimId,
        requesterEmail: claim.get('requesterEmail') ?? null,
      },
    });
    if (merge && selfProfile) {
      auditInTransaction(tx, db, {
        actorUid,
        action: 'player.merged',
        target: selfProfile.ref.path,
        before: { claimedByUid: requesterUid, mergedInto: null },
        after: { mergedInto: playerId, movedWeeks: merge.movedWeeks, claimId },
      });
    }
    return {
      playerId,
      displayName: String(target.get('displayName') ?? ''),
      merged: Boolean(merge),
      movedWeeks: merge?.movedWeeks ?? [],
    };
  });
}

/** `adminRejectClaim`: turn the request down, with an optional friendly note the claimant sees. */
export async function rejectClaim(
  db: Firestore,
  input: { claimId: string; note: unknown; actorUid: string },
): Promise<{ status: 'rejected' }> {
  const note = parseDecisionNote(input.note);
  if (!note.ok) throw new HttpsError('invalid-argument', note.message);
  const claimRef = db.doc(`claims/${input.claimId}`);

  return db.runTransaction(async (tx) => {
    const claim = await tx.get(claimRef);
    if (!claim.exists) throw new HttpsError('not-found', 'That request no longer exists.');
    if (claim.get('status') !== 'pending') {
      throw new HttpsError('failed-precondition', 'That request was already decided.');
    }
    tx.update(claimRef, {
      status: 'rejected',
      decidedBy: input.actorUid,
      decidedAt: FieldValue.serverTimestamp(),
      ...(note.value ? { decisionNote: note.value } : {}),
    });
    auditInTransaction(tx, db, {
      actorUid: input.actorUid,
      action: 'claim.rejected',
      target: claimRef.path,
      before: { status: 'pending' },
      after: {
        status: 'rejected',
        claimedName: claim.get('claimedName'),
        requesterEmail: claim.get('requesterEmail') ?? null,
        decisionNote: note.value,
      },
    });
    return { status: 'rejected' as const };
  });
}

/**
 * `adminUnlinkClaim`: undo a wrong approval. The roster profile goes back to having no login, so
 * the person who was linked can no longer see or change it. Its entries are untouched. Entries
 * that a merge moved onto the profile stay there.
 */
export async function unlinkClaim(
  db: Firestore,
  input: { playerId: string; actorUid: string },
): Promise<{ unlinked: true }> {
  const playerRef = db.doc(`players/${input.playerId}`);
  return db.runTransaction(async (tx) => {
    const player = await tx.get(playerRef);
    requireLiveProfile(player, 'That player');
    if (player.get('origin') !== 'admin') {
      throw new HttpsError(
        'failed-precondition',
        'That profile was made by the player on the website, so there is no approval to undo.',
      );
    }
    const uid = player.get('claimedByUid') as string | null;
    if (!uid) throw new HttpsError('failed-precondition', "That player isn't linked to a login.");

    const approved = await tx.get(
      db.collection('claims').where('resolvedPlayerId', '==', input.playerId),
    );
    tx.update(playerRef, { claimedByUid: null, updatedAt: FieldValue.serverTimestamp() });
    for (const claim of approved.docs) {
      if (claim.get('status') !== 'approved') continue;
      tx.update(claim.ref, {
        status: 'rejected',
        resolvedPlayerId: null,
        decidedBy: input.actorUid,
        decidedAt: FieldValue.serverTimestamp(),
        decisionNote: 'The pool undid this link. Talk to the pool if that looks wrong.',
      });
    }
    auditInTransaction(tx, db, {
      actorUid: input.actorUid,
      action: 'claim.unlinked',
      target: playerRef.path,
      before: { claimedByUid: uid },
      after: { claimedByUid: null },
    });
    return { unlinked: true as const };
  });
}

/**
 * `adminMergePlayers`: two profiles are the same person (a guest who cleared their browser, a
 * double on the roster). Every entry of `fromId` moves to `intoId`, and `fromId` is retired. If
 * only the old profile had a login, the login follows the entries. This cannot be undone.
 */
export async function mergePlayers(
  db: Firestore,
  input: { fromId: string; intoId: string; actorUid: string },
): Promise<MergeResult> {
  const { fromId, intoId, actorUid } = input;
  if (fromId === intoId) {
    throw new HttpsError('invalid-argument', 'Choose two different players to merge.');
  }
  const fromRef = db.doc(`players/${fromId}`);
  const intoRef = db.doc(`players/${intoId}`);
  const weekRefs = await allWeekRefs(db);

  return db.runTransaction(async (tx) => {
    const [from, into] = await Promise.all([tx.get(fromRef), tx.get(intoRef)]);
    requireLiveProfile(from, 'The player being merged');
    requireLiveProfile(into, 'The player being kept');

    const merge = await mergeInTransaction(tx, { from, into, weekRefs });
    const fromUid = (from.get('claimedByUid') as string | null) ?? null;
    const intoUid = (into.get('claimedByUid') as string | null) ?? null;
    const keptUid = intoUid ?? fromUid;

    merge.write();
    if (keptUid !== intoUid) {
      tx.update(intoRef, { claimedByUid: keptUid, updatedAt: FieldValue.serverTimestamp() });
    }
    auditInTransaction(tx, db, {
      actorUid,
      action: 'player.merged',
      target: fromRef.path,
      before: { claimedByUid: fromUid, mergedInto: null, displayName: from.get('displayName') },
      after: {
        mergedInto: intoId,
        intoDisplayName: into.get('displayName'),
        intoClaimedByUid: keptUid,
        movedWeeks: merge.movedWeeks,
      },
    });
    return { intoId, movedWeeks: merge.movedWeeks };
  });
}
