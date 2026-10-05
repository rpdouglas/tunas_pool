/**
 * What the Counter screen shows and offers for each player (D-095). Pure, so every case is tested.
 * It never shows a phone, an email, a note, or a pick: those never reach the counter at all.
 */
import { ASK_COMMISSIONER } from '@shared/counterPolicy';
import type { CounterRow } from '@shared/adminTypes';

export type CounterFilter = 'all' | 'not_yet' | 'entered';

export const COUNTER_FILTER_LABELS: Record<CounterFilter, string> = {
  all: 'Everyone',
  not_yet: 'Not yet in',
  entered: 'In',
};

/** Inactive players stay out of the way unless they have an entry this week. */
const listed = (row: CounterRow) => row.active || row.entered;

export function filterCounterRows(
  rows: CounterRow[],
  filter: CounterFilter,
  query: string,
): CounterRow[] {
  const q = query.trim().toLowerCase();
  return rows
    .filter((row) => {
      if (filter === 'not_yet') return row.active && !row.entered;
      if (filter === 'entered') return row.entered;
      return listed(row);
    })
    .filter((row) => !q || row.displayName.toLowerCase().includes(q));
}

export function counterCounts(rows: CounterRow[]): Record<CounterFilter, number> {
  return {
    all: rows.filter(listed).length,
    not_yet: rows.filter((r) => r.active && !r.entered).length,
    entered: rows.filter((r) => r.entered).length,
  };
}

export interface RowActions {
  /** Enter a new sheet: while the week is open, for an active player who is not in yet. */
  enter: boolean;
  markCash: boolean;
  undoCash: boolean;
  /** Fix the name, phone, or how they usually pay. Only for players the commissioner keeps on the roster. */
  fix: boolean;
  /** Why something is not offered, in plain words, when that is worth saying. */
  note: string | null;
}

export function rowActions(row: CounterRow, weekOpen: boolean): RowActions {
  const paid = row.paymentStatus === 'paid';
  let note: string | null = null;
  if (row.entered && paid && row.paymentMethod === 'etransfer') {
    note = `Paid by e-Transfer. The commissioner confirms those.`;
  } else if (!row.entered && !row.active) {
    note = `Marked inactive. ${ASK_COMMISSIONER}`;
  } else if (!row.entered && !weekOpen) {
    note = `Picks are locked. ${ASK_COMMISSIONER}`;
  }
  return {
    enter: weekOpen && row.active && !row.entered,
    markCash: row.entered && !paid,
    undoCash: row.entered && paid && row.paymentMethod === 'cash',
    fix: row.origin === 'admin',
    note,
  };
}

/** The word for how a player is paid, never colour alone. */
export function paymentWords(row: CounterRow): string {
  if (!row.entered) return '';
  if (row.paymentStatus === 'paid') {
    return row.paymentMethod === 'etransfer' ? 'Paid by e-Transfer' : 'Paid cash';
  }
  if (row.paymentMethod === 'etransfer') return 'Unpaid (said e-Transfer)';
  return 'Unpaid';
}
