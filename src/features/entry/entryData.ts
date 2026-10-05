/**
 * Typed Firestore access for the player's entry (CLAUDE.md §5: no raw getDoc in components).
 * Layout: entries/{playerId} is public, payment/current is private (D-036), private/picks is
 * hidden until the reveal. Times are stamped by the server (D-040).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type {
  Entry,
  EntryPayment,
  EntryPicks,
  PaymentIntent,
  PaymentMethod,
  Pick as PickSide,
  Player,
  PoolConfig,
} from '@shared/types';
import { db } from '../../lib/firebase';
import { weekConverter, type WeekView } from '../../lib/weekModel';

/** The pool contact address on the paper sheet, used until Pool settings says otherwise (D-039). */
export const DEFAULT_CONTACT_EMAIL = 'tunasweeklypool2026@yahoo.com';

export const entryKeys = {
  currentWeek: (year: string) => ['currentWeek', year] as const,
  config: ['poolConfig'] as const,
  mine: (year: string, weekId: string, uid: string) => ['myEntry', year, weekId, uid] as const,
};

/** The latest week players can see: open if there is one, otherwise the last locked or final one. */
export function useCurrentWeek(year: string) {
  return useQuery({
    queryKey: entryKeys.currentWeek(year),
    queryFn: async (): Promise<WeekView | null> => {
      const weeks = collection(db, 'seasons', year, 'weeks').withConverter(weekConverter);
      // Players can only list weeks filtered away from drafts (FIRESTORE_RULES row 36).
      const snap = await getDocs(
        query(
          weeks,
          where('status', 'in', ['open', 'locked', 'final']),
          orderBy('weekNumber', 'desc'),
          limit(1),
        ),
      );
      return snap.empty ? null : snap.docs[0].data();
    },
  });
}

export type PublicPoolConfig = Pick<
  PoolConfig,
  'etransferEmail' | 'etransferInstructions' | 'contactEmail'
>;

export function usePoolConfig() {
  return useQuery({
    queryKey: entryKeys.config,
    queryFn: async (): Promise<PublicPoolConfig> => {
      const snap = await getDoc(doc(db, 'config', 'pool'));
      const data = (snap.exists() ? snap.data() : {}) as Partial<PoolConfig>;
      return {
        etransferEmail: data.etransferEmail || DEFAULT_CONTACT_EMAIL,
        etransferInstructions: data.etransferInstructions ?? '',
        contactEmail: data.contactEmail || DEFAULT_CONTACT_EMAIL,
      };
    },
  });
}

export interface MyEntry {
  playerId: string | null;
  profile: Player | null;
  entry: Entry | null;
  payment: EntryPayment | null;
  picks: EntryPicks | null;
}

/** Find this login's profile by query, never by assuming players/{uid} (D-034). */
export async function findMyProfile(uid: string): Promise<{ id: string; data: Player } | null> {
  const snap = await getDocs(
    query(collection(db, 'players'), where('claimedByUid', '==', uid), limit(1)),
  );
  return snap.empty ? null : { id: snap.docs[0].id, data: snap.docs[0].data() as Player };
}

export async function loadMyEntry(year: string, weekId: string, uid: string): Promise<MyEntry> {
  const profile = await findMyProfile(uid);
  if (!profile) return { playerId: null, profile: null, entry: null, payment: null, picks: null };
  const base = `seasons/${year}/weeks/${weekId}/entries/${profile.id}`;
  const [entry, payment, picks] = await Promise.all([
    getDoc(doc(db, base)),
    getDoc(doc(db, `${base}/payment/current`)).catch(() => null),
    getDoc(doc(db, `${base}/private/picks`)).catch(() => null),
  ]);
  return {
    playerId: profile.id,
    profile: profile.data,
    entry: entry.exists() ? (entry.data() as Entry) : null,
    payment: payment?.exists() ? (payment.data() as EntryPayment) : null,
    picks: picks?.exists() ? (picks.data() as EntryPicks) : null,
  };
}

export function useMyEntry(
  year: string | undefined,
  weekId: string | undefined,
  uid: string | undefined,
) {
  return useQuery({
    queryKey: entryKeys.mine(year ?? '', weekId ?? '', uid ?? ''),
    enabled: Boolean(year && weekId && uid),
    queryFn: () => loadMyEntry(year!, weekId!, uid!),
  });
}

export interface SubmitInput {
  year: string;
  weekId: string;
  uid: string;
  displayName: string;
  phone: string | null; // E.164 or null
  /** Null when the player hasn't said yet. Payment never blocks an entry (PERSONAS: Dale). */
  paymentMethod: PaymentMethod | null;
  paymentIntent: PaymentIntent;
  picks: Record<string, PickSide>;
  tiebreakerTotal: number;
  confirmAge: boolean; // true when the player ticked "I'm 18 or older" on this submit
}

export interface SubmitResult {
  playerId: string;
  picksSubmittedAtMs: number;
}

/**
 * Save the entry (DATA_MODEL §9, "Submit order"). The profile is committed first because the entry
 * rules read it; the entry, payment, and picks then go in one batch, so they land together.
 */
export async function submitEntry(input: SubmitInput): Promise<SubmitResult> {
  const existing = await findMyProfile(input.uid);
  let playerId: string;
  if (!existing) {
    playerId = input.uid; // self-serve profiles start with playerId == uid (DATA_MODEL §1)
    await setDoc(doc(db, 'players', playerId), {
      displayName: input.displayName,
      phone: input.phone,
      email: null,
      claimedByUid: input.uid,
      origin: 'self',
      usualPayment: input.paymentMethod,
      ageAttestedAt: input.confirmAge ? serverTimestamp() : null,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    playerId = existing.id;
    const p = existing.data;
    const changes: Record<string, unknown> = {};
    if (p.displayName !== input.displayName) changes.displayName = input.displayName;
    if ((p.phone ?? null) !== input.phone) changes.phone = input.phone;
    if (input.paymentMethod && p.usualPayment !== input.paymentMethod)
      changes.usualPayment = input.paymentMethod;
    if (input.confirmAge && !p.ageAttestedAt) changes.ageAttestedAt = serverTimestamp();
    if (Object.keys(changes).length > 0) {
      await updateDoc(doc(db, 'players', playerId), { ...changes, updatedAt: serverTimestamp() });
    }
  }

  const entryRef = doc(db, 'seasons', input.year, 'weeks', input.weekId, 'entries', playerId);
  const paymentRef = doc(entryRef, 'payment', 'current');
  const [entrySnap, paymentSnap] = await Promise.all([
    getDoc(entryRef),
    getDoc(paymentRef).catch(() => null),
  ]);
  const batch = writeBatch(db);
  if (entrySnap.exists()) {
    batch.update(entryRef, {
      displayName: input.displayName,
      picksSubmittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(entryRef, {
      playerId,
      displayName: input.displayName,
      enteredBy: 'self',
      source: 'web',
      paperPhotoPath: null,
      lateOverride: null,
      picksSubmittedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  if (!input.paymentMethod) {
    // No payment choice yet: leave payment/current as it is (or absent) until they say.
  } else if (paymentSnap?.exists()) {
    batch.update(paymentRef, {
      paymentMethod: input.paymentMethod,
      paymentIntent: input.paymentIntent,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(paymentRef, {
      paymentMethod: input.paymentMethod,
      paymentIntent: input.paymentIntent,
      paymentStatus: 'unpaid',
      updatedAt: serverTimestamp(),
    });
  }
  batch.set(doc(entryRef, 'private', 'picks'), {
    picks: input.picks,
    tiebreakerTotal: input.tiebreakerTotal,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();

  // The receipt and confirmation code use the server's time, so read it back from the server.
  const saved = await getDocFromServer(entryRef);
  const stamped = (saved.data() as Entry).picksSubmittedAt;
  return { playerId, picksSubmittedAtMs: stamped.toDate().getTime() };
}

export function useSubmitEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: submitEntry,
    onSuccess: (_, input) =>
      client.invalidateQueries({ queryKey: entryKeys.mine(input.year, input.weekId, input.uid) }),
  });
}
