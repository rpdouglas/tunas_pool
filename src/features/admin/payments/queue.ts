/** Filtering and counting for the payments queue (pure, unit tested). */
import { normalizeName } from '@shared/duplicates';
import type { EntryRow } from '@shared/adminTypes';

export type QueueFilter = 'unpaid' | 'paid' | 'all' | 'cash' | 'etransfer' | 'check';

export const FILTER_LABELS: Record<QueueFilter, string> = {
  unpaid: 'Unpaid',
  paid: 'Paid',
  all: 'All',
  cash: 'Cash',
  etransfer: 'e-Transfer',
  check: 'Check',
};

const matches = (row: EntryRow, filter: QueueFilter): boolean => {
  switch (filter) {
    case 'unpaid':
      return row.paymentStatus === 'unpaid';
    case 'paid':
      return row.paymentStatus === 'paid';
    case 'cash':
    case 'etransfer':
      return row.paymentMethod === filter;
    case 'check':
      return row.duplicates.length > 0;
    default:
      return true;
  }
};

export function filterRows(rows: EntryRow[], filter: QueueFilter, query: string): EntryRow[] {
  const text = normalizeName(query);
  const digits = query.replace(/\D/g, '');
  return rows
    .filter((row) => matches(row, filter))
    .filter((row) => {
      if (!text && !digits) return true;
      const nameHit = text !== '' && normalizeName(row.displayName).includes(text);
      const phoneHit = digits.length >= 3 && (row.phone ?? '').replace(/\D/g, '').includes(digits);
      return nameHit || phoneHit;
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function queueCounts(rows: EntryRow[], entryFeeCents: number) {
  const paid = rows.filter((r) => r.paymentStatus === 'paid').length;
  return {
    total: rows.length,
    paid,
    unpaid: rows.length - paid,
    potCents: paid * entryFeeCents,
    ifEveryonePaidCents: rows.length * entryFeeCents,
    byFilter: Object.fromEntries(
      (Object.keys(FILTER_LABELS) as QueueFilter[]).map((f) => [
        f,
        rows.filter((r) => matches(r, f)).length,
      ]),
    ) as Record<QueueFilter, number>,
  };
}
