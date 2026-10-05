/**
 * Typed Firestore access for the roster (CLAUDE.md §5: no raw getDoc in components). The rules let
 * an admin add and edit roster profiles directly: a name, and optionally a phone, the usual payment,
 * and a note. They never let anyone change who a profile is linked to (`claimedByUid`).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import type { Player } from '@shared/types';
import { db } from '../../../lib/firebase';
import type { PlayerFields, RosterPlayer } from './roster';

export const rosterKey = ['roster'] as const;

function toRosterPlayer(playerId: string, p: Player): RosterPlayer {
  return {
    playerId,
    displayName: p.displayName,
    phone: p.phone ?? null,
    usualPayment: p.usualPayment ?? null,
    notes: p.notes ?? null,
    active: p.active !== false,
    origin: p.origin,
    claimed: Boolean(p.claimedByUid),
  };
}

/** Everyone the pool knows: roster profiles and players who entered on the website. */
export function useRoster() {
  return useQuery({
    queryKey: rosterKey,
    queryFn: async (): Promise<RosterPlayer[]> => {
      const snap = await getDocs(collection(db, 'players'));
      return snap.docs
        .filter((d) => !(d.data() as Player).mergedInto) // a merged profile lives on as the other one
        .map((d) => toRosterPlayer(d.id, d.data() as Player));
    },
  });
}

export interface SavePlayerInput {
  /** Null to add a new roster player. */
  playerId: string | null;
  fields: PlayerFields;
  active?: boolean;
}

export function useSavePlayer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ playerId, fields, active }: SavePlayerInput): Promise<string> => {
      if (playerId) {
        await updateDoc(doc(db, 'players', playerId), {
          ...fields,
          ...(active === undefined ? {} : { active }),
          updatedAt: serverTimestamp(),
        });
        return playerId;
      }
      const ref = doc(collection(db, 'players')); // roster profiles get an auto ID (DATA_MODEL §1)
      await setDoc(ref, {
        ...fields,
        email: null,
        claimedByUid: null,
        origin: 'admin',
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: rosterKey }),
  });
}
