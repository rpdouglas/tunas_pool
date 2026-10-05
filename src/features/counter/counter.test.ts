import type { CounterRow } from '@shared/adminTypes';
import { counterCounts, filterCounterRows, paymentWords, rowActions } from './counter';

const row = (id: string, over: Partial<CounterRow> = {}): CounterRow => ({
  playerId: id,
  displayName: id.toUpperCase(),
  active: true,
  origin: 'admin',
  entered: false,
  source: null,
  late: false,
  paymentStatus: null,
  paymentMethod: null,
  ...over,
});

const ROWS = [
  row('dale', { entered: true, paymentStatus: 'paid', paymentMethod: 'cash' }),
  row('jen', { entered: true, paymentStatus: 'unpaid', paymentMethod: 'etransfer' }),
  row('rosalie'),
  row('walt'),
  row('old', { active: false }),
  row('left', { active: false, entered: true, paymentStatus: 'paid', paymentMethod: 'cash' }),
];

describe('the counter list', () => {
  it('"Everyone" leaves out inactive players unless they entered', () => {
    expect(filterCounterRows(ROWS, 'all', '').map((r) => r.playerId)).toEqual([
      'dale',
      'jen',
      'rosalie',
      'walt',
      'left',
    ]);
  });

  it('"Not yet in" is the active players with no entry, and "In" is everyone with one', () => {
    expect(filterCounterRows(ROWS, 'not_yet', '').map((r) => r.playerId)).toEqual([
      'rosalie',
      'walt',
    ]);
    expect(filterCounterRows(ROWS, 'entered', '').map((r) => r.playerId)).toEqual([
      'dale',
      'jen',
      'left',
    ]);
  });

  it('finds a player by part of a name, in any case', () => {
    expect(filterCounterRows(ROWS, 'all', ' ROS ').map((r) => r.playerId)).toEqual(['rosalie']);
    expect(filterCounterRows(ROWS, 'all', 'zzz')).toEqual([]);
  });

  it('counts each list', () => {
    expect(counterCounts(ROWS)).toEqual({ all: 5, not_yet: 2, entered: 3 });
  });
});

describe('what the counter can do for a player', () => {
  it('offers Enter picks to an active player who is not in, while the week is open', () => {
    expect(rowActions(row('walt'), true)).toMatchObject({
      enter: true,
      markCash: false,
      note: null,
    });
  });

  it('offers Paid cash once they are in and unpaid, including someone who said e-Transfer', () => {
    expect(rowActions(ROWS[0], true).markCash).toBe(false);
    expect(rowActions(ROWS[1], true)).toMatchObject({ markCash: true, undoCash: false });
  });

  it('offers Undo only for cash, and explains an e-Transfer instead', () => {
    expect(rowActions(ROWS[0], true)).toMatchObject({ undoCash: true, markCash: false });
    const etransfer = row('troy', {
      entered: true,
      paymentStatus: 'paid',
      paymentMethod: 'etransfer',
    });
    const actions = rowActions(etransfer, true);
    expect(actions).toMatchObject({ undoCash: false, markCash: false });
    expect(actions.note).toBe('Paid by e-Transfer. The commissioner confirms those.');
  });

  it('after the lock offers no new entry, and says to ask the commissioner', () => {
    const actions = rowActions(row('walt'), false);
    expect(actions.enter).toBe(false);
    expect(actions.note).toBe('Picks are locked. Ask the commissioner.');
    // Taking cash for a sheet that is already in still works after the lock.
    expect(rowActions(ROWS[1], false).markCash).toBe(true);
  });

  it('offers nothing for an inactive player, and says why', () => {
    const actions = rowActions(row('old', { active: false }), true);
    expect(actions.enter).toBe(false);
    expect(actions.note).toBe('Marked inactive. Ask the commissioner.');
  });

  it('lets the counter fix the roster players only, not someone who signed up on the website', () => {
    expect(rowActions(row('a'), true).fix).toBe(true);
    expect(rowActions(row('b', { origin: 'self' }), true).fix).toBe(false);
  });
});

describe('paymentWords', () => {
  it('says it in words', () => {
    expect(paymentWords(ROWS[0])).toBe('Paid cash');
    expect(paymentWords(ROWS[1])).toBe('Unpaid (said e-Transfer)');
    expect(paymentWords(row('x', { entered: true }))).toBe('Unpaid');
    expect(
      paymentWords(row('y', { entered: true, paymentStatus: 'paid', paymentMethod: 'etransfer' })),
    ).toBe('Paid by e-Transfer');
    expect(paymentWords(row('walt'))).toBe('');
  });
});
