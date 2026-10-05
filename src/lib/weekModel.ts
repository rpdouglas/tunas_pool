/**
 * The week document as the app reads it: kickoffs and lock as epoch milliseconds, so screens and
 * the shared week logic never deal with Timestamp classes. Used by admin and player screens.
 */
import type { FirestoreDataConverter } from 'firebase/firestore';
import type { Game, Week, WeekStatus } from '@shared/types';
import type { GameDraft } from '@shared/weeks';

export interface WeekView {
  id: string;
  year: string;
  weekNumber: number;
  status: WeekStatus;
  lockAtMs: number;
  revealed: boolean;
  games: GameDraft[];
  mnfGameId: string;
  entryFeeCents: number;
  entryCount: number;
}

export const weekConverter: FirestoreDataConverter<WeekView> = {
  toFirestore: () => {
    throw new Error('Weeks are written field by field, not through this converter.');
  },
  fromFirestore(snapshot) {
    const w = snapshot.data() as Week;
    return {
      id: snapshot.id,
      year: snapshot.ref.parent.parent!.id,
      weekNumber: w.weekNumber,
      status: w.status,
      lockAtMs: w.lockAt.toDate().getTime(),
      revealed: w.revealed,
      games: (w.games ?? []).map((g: Game) => ({ ...g, kickoffMs: g.kickoff.toDate().getTime() })),
      mnfGameId: w.mnfGameId,
      entryFeeCents: w.entryFeeCents,
      entryCount: w.entryCount ?? 0,
    };
  },
};
