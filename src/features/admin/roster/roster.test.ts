import { describe, expect, it } from 'vitest';
import type { EntryRow } from '@shared/adminTypes';
import {
  filterRoster,
  possibleMatches,
  rosterCounts,
  rosterRows,
  validatePlayer,
  type RosterPlayer,
} from './roster';

const player = (playerId: string, overrides: Partial<RosterPlayer> = {}): RosterPlayer => ({
  playerId,
  displayName: playerId,
  phone: null,
  usualPayment: null,
  notes: null,
  active: true,
  origin: 'admin',
  claimed: false,
  ...overrides,
});

const entry = (playerId: string): EntryRow => ({
  playerId,
  displayName: playerId,
  phone: null,
  email: null,
  source: 'paper',
  enteredBy: 'admin',
  hasPaperPhoto: false,
  picksSubmittedAtMs: 1,
  lateOverride: false,
  paymentMethod: 'cash',
  paymentIntent: 'already_did',
  paymentStatus: 'paid',
  paidAtMs: 1,
  record: null,
  duplicates: [],
});

const PLAYERS = [
  player('rosalie', { displayName: 'Rosalie M.', phone: '+16135550144' }),
  player('bernie', { displayName: 'Bernie T.' }),
  player('gone', { displayName: 'Old Timer', active: false }),
  player('left', { displayName: 'Left Midweek', active: false }),
];
const ROWS = rosterRows(PLAYERS, [entry('rosalie'), entry('left')]);

describe('rosterRows', () => {
  it("puts this week's entry beside each player, by name", () => {
    expect(ROWS.map((r) => r.displayName)).toEqual([
      'Bernie T.',
      'Left Midweek',
      'Old Timer',
      'Rosalie M.',
    ]);
    expect(ROWS.find((r) => r.playerId === 'rosalie')?.entry?.paymentStatus).toBe('paid');
    expect(ROWS.find((r) => r.playerId === 'bernie')?.entry).toBeNull();
  });
});

describe('filterRoster', () => {
  it('"Not yet" is the active players with no entry this week', () => {
    expect(filterRoster(ROWS, 'not_yet', '').map((r) => r.playerId)).toEqual(['bernie']);
  });

  it('"Entered" includes someone made inactive after entering', () => {
    expect(filterRoster(ROWS, 'entered', '').map((r) => r.playerId)).toEqual(['left', 'rosalie']);
  });

  it('"All" leaves out inactive players unless they entered this week', () => {
    expect(filterRoster(ROWS, 'all', '').map((r) => r.playerId)).toEqual([
      'bernie',
      'left',
      'rosalie',
    ]);
    expect(filterRoster(ROWS, 'inactive', '').map((r) => r.playerId)).toEqual(['left', 'gone']);
  });

  it('finds by part of a name or of a phone number', () => {
    expect(filterRoster(ROWS, 'all', 'rosa').map((r) => r.playerId)).toEqual(['rosalie']);
    expect(filterRoster(ROWS, 'all', '0144').map((r) => r.playerId)).toEqual(['rosalie']);
    expect(filterRoster(ROWS, 'all', 'zzz')).toEqual([]);
  });

  it('counts each filter', () => {
    expect(rosterCounts(ROWS)).toEqual({ not_yet: 1, entered: 2, all: 3, inactive: 2 });
  });
});

describe('validatePlayer', () => {
  const values = { displayName: '  Rosalie   M. ', phone: '', usualPayment: null, notes: '' };

  it('needs only a name', () => {
    expect(validatePlayer(values)).toEqual({
      ok: true,
      fields: { displayName: 'Rosalie M.', phone: null, usualPayment: null, notes: null },
    });
  });

  it('normalizes a phone number from either side of the border', () => {
    expect(validatePlayer({ ...values, phone: '(315) 555-0199' })).toMatchObject({
      fields: { phone: '+13155550199' },
    });
  });

  it('explains a missing name, a bad phone, and notes that run long', () => {
    const result = validatePlayer({
      displayName: ' ',
      phone: '555',
      usualPayment: 'cash',
      notes: 'x'.repeat(501),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toEqual(['displayName', 'phone', 'notes']);
    expect(validatePlayer({ ...values, displayName: 'x'.repeat(61) }).ok).toBe(false);
  });
});

describe('possibleMatches', () => {
  it('flags the same phone and a similar name, and never the player being edited', () => {
    const same = possibleMatches(
      { playerId: null, displayName: 'Rose M.', phone: '+16135550144' },
      PLAYERS,
    );
    expect(same).toHaveLength(1);
    expect(same[0].player.playerId).toBe('rosalie');
    expect(same[0].reasons).toContain('phone');

    expect(
      possibleMatches({ playerId: null, displayName: 'Bernie T', phone: null }, PLAYERS)[0],
    ).toMatchObject({ player: { playerId: 'bernie' }, reasons: ['name'] });
    expect(
      possibleMatches({ playerId: 'bernie', displayName: 'Bernie T.', phone: null }, PLAYERS),
    ).toEqual([]);
    expect(possibleMatches({ playerId: null, displayName: 'Wanda', phone: null }, PLAYERS)).toEqual(
      [],
    );
  });
});
