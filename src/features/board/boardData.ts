/**
 * Data for the weekly board (D-102). Posts, edits, deletes, and reports are direct writes the
 * rules check (firestore.rules, the board section); hiding and muting go through the audited
 * callables `boardHide` and `boardMute`. The board updates live while it is on screen.
 */
import { useCallback, useEffect, useState } from 'react';
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
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { unreadCount } from '@shared/board';
import { db, functions } from '../../lib/firebase';
import type { WeekView } from '../../lib/weekModel';
import { useAuth } from '../auth/useAuth';

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

/**
 * Which of these weeks this player entered, for the earlier boards (D-139): the rules let you read
 * a week's board only if you did. One public entry document per week.
 */
export function useMyEnteredWeeks(year: string, playerId: string | null, weekIds: string[]) {
  return useQuery({
    queryKey: ['boardEnteredWeeks', year, playerId ?? '', weekIds.join(',')],
    enabled: Boolean(playerId) && weekIds.length > 0,
    queryFn: async () => {
      const snaps = await Promise.all(
        weekIds.map((id) => getDoc(doc(db, `${weekPath(year, id)}/entries/${playerId}`))),
      );
      return weekIds.filter((_, i) => snaps[i].exists());
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

/**
 * A post, in a batch with the poster's `boardLast` stamp: the rules allow one post every 30
 * seconds and read the stamp to tell (D-109).
 */
export function postMessage(
  year: string,
  weekId: string,
  author: { playerId: string; displayName: string },
  text: string,
) {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, `${weekPath(year, weekId)}/board`)), {
    playerId: author.playerId,
    displayName: author.displayName,
    text,
    createdAt: serverTimestamp(),
    editedAt: null,
    hidden: false,
  });
  batch.set(doc(db, `${weekPath(year, weekId)}/boardLast/${author.playerId}`), {
    at: serverTimestamp(),
  });
  return batch.commit();
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

// When this viewer last opened each week's board, kept in their own browser (D-109). A private
// window or blocked storage just means every post counts as new.
const seenKey = (year: string, weekId: string) => `tunas:boardSeen:${year}/${weekId}`;

function readSeen(key: string): number | null {
  try {
    const value = localStorage.getItem(key);
    return value ? Number(value) : null;
  } catch {
    return null;
  }
}

/**
 * How many posts came in since this viewer last opened the week's board (D-109), for the Board
 * tab, and `markSeen` for when they open it. Zero for someone who can't read the board.
 */
export function useBoardUnread(year: string, week: WeekView) {
  const { user, isAdmin, isCounter } = useAuth();
  const join = useBoardJoin(user?.uid);
  const playerId = join.data ?? null;
  const standing = useBoardStanding(year, week.id, playerId);
  const canRead = isAdmin || isCounter || standing.data?.entered === true;
  const board = useBoardMessages(year, week.id, join.isSuccess && canRead);
  const key = seenKey(year, week.id);
  const [seen, setSeen] = useState<Record<string, number | null>>({});
  const lastSeen = key in seen ? seen[key] : readSeen(key);
  const latest = board.messages.reduce((max, m) => Math.max(max, m.createdAtMs), 0);

  const markSeen = useCallback(() => {
    if (!latest || (lastSeen !== null && lastSeen >= latest)) return;
    try {
      localStorage.setItem(key, String(latest));
    } catch {
      // Storage blocked: remember it for this visit only.
    }
    setSeen((prev) => ({ ...prev, [key]: latest }));
  }, [key, latest, lastSeen]);

  return {
    count: canRead && !board.loading ? unreadCount(board.messages, playerId, lastSeen) : 0,
    markSeen,
  };
}

/** Who is muted on this week's board, with the reason, for the staff only (D-109). */
export function useBoardMutes(year: string, weekId: string, staff: boolean) {
  const [muted, setMuted] = useState<{ playerId: string; displayName: string; reason: string }[]>(
    [],
  );
  useEffect(() => {
    if (!staff) return;
    let live = true;
    const stop = onSnapshot(
      collection(db, `${weekPath(year, weekId)}/boardMutes`),
      async (snap) => {
        const rows = await Promise.all(
          snap.docs.map(async (d) => {
            const player = await getDoc(doc(db, `players/${d.id}`)).catch(() => null);
            return {
              playerId: d.id,
              displayName: String(player?.get('displayName') ?? 'A player'),
              reason: String(d.get('reason') ?? ''),
            };
          }),
        );
        if (live) setMuted(rows.sort((a, b) => a.displayName.localeCompare(b.displayName)));
      },
      () => setMuted([]),
    );
    return () => {
      live = false;
      stop();
    };
  }, [year, weekId, staff]);
  return muted;
}
