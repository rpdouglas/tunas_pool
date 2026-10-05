/**
 * A half-entered sheet kept on the device (PERSONAS: the Commissioner is interrupted constantly), so
 * a customer at the counter never costs the picks typed so far. One draft per player per week,
 * cleared when the entry is saved. The photo itself is not kept: it is chosen again.
 */
import type { EntrySource, Pick as PickSide } from '@shared/types';

export type PaidChoice = 'none' | 'cash' | 'etransfer';

export interface AdminEntryDraft {
  picks: Record<string, PickSide>;
  tiebreaker: string;
  source: EntrySource;
  paid: PaidChoice;
  reason: string;
}

const key = (year: string, weekId: string, playerId: string) =>
  `tunas.adminDraft.${year}:${weekId}:${playerId}`;

export function loadAdminDraft(
  year: string,
  weekId: string,
  playerId: string,
): AdminEntryDraft | null {
  try {
    const raw = window.localStorage.getItem(key(year, weekId, playerId));
    return raw ? (JSON.parse(raw) as AdminEntryDraft) : null;
  } catch {
    return null;
  }
}

export function saveAdminDraft(
  year: string,
  weekId: string,
  playerId: string,
  draft: AdminEntryDraft | null,
): void {
  try {
    if (draft) window.localStorage.setItem(key(year, weekId, playerId), JSON.stringify(draft));
    else window.localStorage.removeItem(key(year, weekId, playerId));
  } catch {
    // Private browsing or full storage: the form still works, it just won't survive a reload.
  }
}
