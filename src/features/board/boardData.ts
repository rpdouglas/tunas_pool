/**
 * Data for the weekly board (D-102). Posts, edits, deletes, and reports are direct writes the
 * rules check (firestore.rules, the board section); hiding and muting go through the audited
 * callables `boardHide` and `boardMute`. The board updates live while it is on screen.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';

const weekPath = (year: string, weekId: string) => `seasons/${year}/weeks/${weekId}`;

export interface BoardMessage {
  id: string;
  playerId: string;
  displayName: string;
  text: string;
  createdAtMs: number;
  edited: boolean;
  hidden: boolean;
}

/**
 * Points this login at its player (`boardJoin`), once per login per visit, so the rules can tell
 * that this reader entered the week. Returns the player ID, or null when the login has none.
 */
export function useBoardJoin(uid: string | undefined) {
  return useQuery({
    queryKey: ['boardJoin', uid ?? ''],
    enabled: Boolean(uid),
    staleTime: Infinity,
    retry: 1,
    queryFn: async () =>
      (await httpsCallable<void, { playerId: string | null }>(functions, 'boardJoin')()).data
        .playerId,
  });
}

/** What the rules will check for this player this week: an entry, paid, and not muted. */
export function useBoardStanding(year: string, weekId: string, playerId: string | null) {
  return useQuery({
    queryKey: ['boardStanding', year, weekId, playerId ?? ''],
    enabled: Boolean(playerId),
    queryFn: async () => {
      const base = `${weekPath(year, weekId)}/entries/${playerId}`;
      const [entry, payment, mute] = await Promise.all([
        getDoc(doc(db, base)),
        getDoc(doc(db, `${base}/payment/current`)).catch(() => null),
        getDoc(doc(db, `${weekPath(year, weekId)}/boardMutes/${playerId}`)).catch(() => null),
      ]);
      return {
        entered: entry.exists(),
        paid: payment?.exists() === true && payment.get('paymentStatus') === 'paid',
        muted: mute?.exists() === true,
      };
    },
  });
}

/** The week's posts, oldest first, live while `enabled`. */
export function useBoardMessages(year: string, weekId: string, enabled: boolean) {
  const [state, setState] = useState<{
    messages: BoardMessage[];
    loading: boolean;
    failed: boolean;
  }>({ messages: [], loading: true, failed: false });

  useEffect(() => {
    if (!enabled) return;
    const q = query(
      collection(db, `${weekPath(year, weekId)}/board`),
      orderBy('createdAt', 'asc'),
      limit(300),
    );
    return onSnapshot(
      q,
      (snap) =>
        setState({
          loading: false,
          failed: false,
          messages: snap.docs.map((d) => {
            // A post just sent has no server time yet: use the estimate until it arrives.
            const at = d.get('createdAt', { serverTimestamps: 'estimate' }) as Timestamp | null;
            return {
              id: d.id,
              playerId: String(d.get('playerId') ?? ''),
              displayName: String(d.get('displayName') ?? ''),
              text: String(d.get('text') ?? ''),
              createdAtMs: at ? at.toMillis() : Date.now(),
              edited: d.get('editedAt') != null,
              hidden: d.get('hidden') === true,
            };
          }),
        }),
      () => setState((s) => ({ ...s, loading: false, failed: true })),
    );
  }, [year, weekId, enabled]);

  return state;
}

/** How many times each post was reported, for the staff only. */
export function useBoardReports(year: string, weekId: string, staff: boolean) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!staff) return;
    return onSnapshot(
      collection(db, `${weekPath(year, weekId)}/boardReports`),
      (snap) => {
        const next: Record<string, number> = {};
        snap.docs.forEach((d) => {
          const id = String(d.get('messageId'));
          next[id] = (next[id] ?? 0) + 1;
        });
        setCounts(next);
      },
      () => setCounts({}),
    );
  }, [year, weekId, staff]);
  return counts;
}

export function postMessage(
  year: string,
  weekId: string,
  author: { playerId: string; displayName: string },
  text: string,
) {
  return setDoc(doc(collection(db, `${weekPath(year, weekId)}/board`)), {
    playerId: author.playerId,
    displayName: author.displayName,
    text,
    createdAt: serverTimestamp(),
    editedAt: null,
    hidden: false,
  });
}

export function editMessage(year: string, weekId: string, id: string, text: string) {
  return updateDoc(doc(db, `${weekPath(year, weekId)}/board/${id}`), {
    text,
    editedAt: serverTimestamp(),
  });
}

export function deleteMessage(year: string, weekId: string, id: string) {
  return deleteDoc(doc(db, `${weekPath(year, weekId)}/board/${id}`));
}

/** One report per player per post: the ID makes a second tap the same report. */
export function reportMessage(year: string, weekId: string, messageId: string, playerId: string) {
  return setDoc(doc(db, `${weekPath(year, weekId)}/boardReports/${messageId}_${playerId}`), {
    messageId,
    playerId,
    createdAt: serverTimestamp(),
  });
}

export function hideMessage(year: string, weekId: string, messageId: string, reason: string) {
  return httpsCallable(functions, 'boardHide')({ year, weekId, messageId, reason });
}

export function setMute(
  year: string,
  weekId: string,
  playerId: string,
  muted: boolean,
  reason: string,
) {
  return httpsCallable(functions, 'boardMute')({ year, weekId, playerId, muted, reason });
}
