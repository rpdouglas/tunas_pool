import type { EntryRow } from '@shared/adminTypes';
import { filterRows, queueCounts } from './queue';

const row = (
  playerId: string,
  displayName: string,
  overrides: Partial<EntryRow> = {},
): EntryRow => ({
  playerId,
  displayName,
  phone: null,
  email: null,
  source: 'web',
  picksSubmittedAtMs: null,
  lateOverride: false,
  paymentMethod: 'cash',
  paymentIntent: 'will_do',
  paymentStatus: 'unpaid',
  paidAtMs: null,
  record: null,
  duplicates: [],
  ...overrides,
});

const rows = [
  row('a', 'Dale D.', { phone: '+16135550123', paymentStatus: 'paid', paymentMethod: 'etransfer' }),
  row('b', 'Jen K.', { phone: '+13155550199' }),
  row('c', 'Alex R.', {
    paymentMethod: null,
    duplicates: [{ otherPlayerId: 'd', otherName: 'Alexander R.', reasons: ['similar_name'] }],
  }),
  row('d', 'Alexander R.', { paymentMethod: 'etransfer' }),
];

describe('payments queue', () => {
  it('filters by status, method, and possible duplicates, sorted by name', () => {
    expect(filterRows(rows, 'unpaid', '').map((r) => r.playerId)).toEqual(['c', 'd', 'b']);
    expect(filterRows(rows, 'paid', '').map((r) => r.playerId)).toEqual(['a']);
    expect(filterRows(rows, 'all', '')).toHaveLength(4);
    expect(filterRows(rows, 'cash', '').map((r) => r.playerId)).toEqual(['b']);
    expect(filterRows(rows, 'etransfer', '').map((r) => r.playerId)).toEqual(['d', 'a']);
    expect(filterRows(rows, 'check', '').map((r) => r.playerId)).toEqual(['c']);
  });

  it('finds people by part of a name or phone number, ignoring case and punctuation', () => {
    expect(filterRows(rows, 'all', 'dale').map((r) => r.playerId)).toEqual(['a']);
    expect(filterRows(rows, 'all', 'ALEX').map((r) => r.playerId)).toEqual(['c', 'd']);
    expect(filterRows(rows, 'all', '(613) 555').map((r) => r.playerId)).toEqual(['a']);
    expect(filterRows(rows, 'all', '315').map((r) => r.playerId)).toEqual(['b']);
    expect(filterRows(rows, 'all', 'zzz')).toEqual([]);
  });

  it('counts paid and unpaid entries and the pot', () => {
    const counts = queueCounts(rows, 2000);
    expect(counts).toMatchObject({
      total: 4,
      paid: 1,
      unpaid: 3,
      potCents: 2000,
      ifEveryonePaidCents: 8000,
    });
    expect(counts.byFilter).toMatchObject({
      unpaid: 3,
      paid: 1,
      all: 4,
      check: 1,
      cash: 1,
      etransfer: 2,
    });
  });
});
