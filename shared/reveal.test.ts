import { describe, expect, it } from 'vitest';
import {
  gameShare,
  leaderboard,
  pickMark,
  rankLabel,
  shareLine,
  sharePercent,
  type RevealEntry,
} from './reveal';
import type { Pick } from './types';

const GAMES = ['g01', 'g02', 'g03', 'mnf'];
const entry = (
  name: string,
  picks: Record<string, Pick>,
  extra: Partial<RevealEntry> = {},
): RevealEntry => ({
  playerId: name.toLowerCase(),
  displayName: name,
  picks,
  tiebreakerTotal: 40,
  submittedAtMs: 1,
  late: false,
  ...extra,
});

const ENTRIES = [
  entry('Dale', { g01: 'home', g02: 'home', g03: 'away', mnf: 'home' }),
  entry('Jen', { g01: 'home', g02: 'away', g03: 'away', mnf: 'away' }),
  entry('Alex', { g01: 'away', g02: 'home', g03: 'home', mnf: 'home' }),
  entry('Rosalie', { g01: 'home', g02: 'home' }, { late: true }), // two blanks on her sheet
];

describe('pickMark', () => {
  it('marks right, wrong, and not played yet', () => {
    expect(pickMark('home', 'home')).toBe('correct');
    expect(pickMark('home', 'away')).toBe('missed');
    expect(pickMark('home', undefined)).toBe('pending');
  });

  it('a tied game is a miss for both sides, and a blank is a miss once the game is decided', () => {
    expect(pickMark('home', 'tie')).toBe('missed');
    expect(pickMark('away', 'tie')).toBe('missed');
    expect(pickMark(undefined, 'home')).toBe('missed');
    expect(pickMark(undefined, undefined)).toBe('blank');
  });
});

describe('leaderboard', () => {
  it('before any result everyone is level, with every game still to play', () => {
    const rows = leaderboard(ENTRIES, GAMES, {});
    expect(
      rows.map((r) => [r.displayName, r.wins, r.remaining, r.bestPossible, r.rank, r.tied]),
    ).toEqual([
      ['Alex', 0, 4, 4, 1, true],
      ['Dale', 0, 4, 4, 1, true],
      ['Jen', 0, 4, 4, 1, true],
      ['Rosalie', 0, 4, 4, 1, true],
    ]);
  });

  it('ranks by wins as results come in, sharing a rank when level', () => {
    const rows = leaderboard(ENTRIES, GAMES, { g01: 'home', g02: 'home' });
    expect(
      rows.map((r) => [r.displayName, r.wins, r.losses, r.remaining, r.bestPossible, r.rank]),
    ).toEqual([
      ['Dale', 2, 0, 2, 4, 1],
      ['Rosalie', 2, 0, 2, 4, 1],
      ['Alex', 1, 1, 2, 3, 3],
      ['Jen', 1, 1, 2, 3, 3],
    ]);
    expect(rows[0].tied).toBe(true);
    expect(rankLabel(rows[0])).toBe('Tied 1');
  });

  it('counts a blank as a loss once the game is decided, so records add up', () => {
    const rows = leaderboard(ENTRIES, GAMES, {
      g01: 'home',
      g02: 'home',
      g03: 'away',
      mnf: 'home',
    });
    const rosalie = rows.find((r) => r.displayName === 'Rosalie')!;
    expect([rosalie.wins, rosalie.losses, rosalie.remaining]).toEqual([2, 2, 0]);
    expect(rows[0]).toMatchObject({ displayName: 'Dale', wins: 4, rank: 1, tied: false });
    expect(rankLabel(rows[0])).toBe('1');
    for (const r of rows) expect(r.wins + r.losses).toBe(4);
  });

  it('keeps the late marker and the tiebreaker guess on the row', () => {
    const rows = leaderboard(ENTRIES, GAMES, {});
    expect(rows.find((r) => r.displayName === 'Rosalie')).toMatchObject({
      late: true,
      tiebreakerTotal: 40,
    });
  });

  it('is empty for a week nobody entered', () => {
    expect(leaderboard([], GAMES, {})).toEqual([]);
  });
});

describe('gameShare and shareLine', () => {
  const game = { away: 'Packers', home: 'Bears' };

  it('lists who picked each side, and who left it blank', () => {
    expect(gameShare('g03', ENTRIES)).toEqual({
      away: ['Dale', 'Jen'],
      home: ['Alex'],
      blank: ['Rosalie'],
      total: 4,
    });
  });

  it('says nothing before the game is decided', () => {
    expect(shareLine(game, gameShare('g03', ENTRIES), undefined)).toBeNull();
  });

  it('says "Only" when few picked the winner, and never calls anyone out of it', () => {
    const line = shareLine(game, gameShare('g03', ENTRIES), 'home');
    expect(line).toBe('Only 1 of 4 picked the Bears.');
    expect(line).not.toMatch(/eliminated|out of/i);
    expect(shareLine(game, gameShare('g03', ENTRIES), 'away')).toBe('2 of 4 picked the Packers.');
  });

  it('handles everyone, nobody, and a tie', () => {
    const all = [entry('A', { g01: 'home' }), entry('B', { g01: 'home' })];
    expect(shareLine(game, gameShare('g01', all), 'home')).toBe('Everyone picked the Bears.');
    expect(shareLine(game, gameShare('g01', all), 'away')).toBe('Nobody picked the Packers.');
    expect(shareLine(game, gameShare('g01', all), 'tie')).toMatch(/tie/);
    expect(shareLine(game, gameShare('g01', []), 'home')).toBeNull();
  });
});

describe('sharePercent', () => {
  it('never rounds someone down to 0% or up to 100%', () => {
    expect(sharePercent(0, 40)).toBe(0);
    expect(sharePercent(40, 40)).toBe(100);
    expect(sharePercent(1, 400)).toBe(1);
    expect(sharePercent(399, 400)).toBe(99);
    expect(sharePercent(12, 40)).toBe(30);
    expect(sharePercent(0, 0)).toBe(0);
  });
});
