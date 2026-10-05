import { describe, expect, it } from 'vitest';
import {
  bestWeek,
  buildAllTime,
  buildStandings,
  standingPlaces,
  winPercent,
  type SeasonWeek,
  type StandingsPlayer,
} from './standings';

/**
 * Three weeks, checked by hand:
 *
 *            wk01     wk02     wk03 (not final)
 *   Dale     11-4 W   8-7      12-3
 *   Jen       9-6     10-5 W   -
 *   Rosalie   9-6     -        9-6
 *   Guest    12-3     -        -      (a guest login: weekly only)
 *
 *   Season (final weeks only):  Dale 19-11, 2 weeks, 1 title
 *                               Jen  19-11, 2 weeks, 1 title
 *                               Rosalie 9-6, 1 week, 0 titles
 */
const WEEKS: SeasonWeek[] = [
  {
    weekId: 'wk01',
    weekNumber: 1,
    status: 'final',
    winnerIds: ['dale'],
    records: [
      { playerId: 'dale', wins: 11, losses: 4 },
      { playerId: 'jen', wins: 9, losses: 6 },
      { playerId: 'rosalie', wins: 9, losses: 6 },
      { playerId: 'guest', wins: 12, losses: 3 },
    ],
  },
  {
    weekId: 'wk02',
    weekNumber: 2,
    status: 'final',
    winnerIds: ['jen'],
    records: [
      { playerId: 'dale', wins: 8, losses: 7 },
      { playerId: 'jen', wins: 10, losses: 5 },
    ],
  },
  {
    weekId: 'wk03',
    weekNumber: 3,
    status: 'locked',
    winnerIds: [],
    records: [
      { playerId: 'dale', wins: 12, losses: 3 },
      { playerId: 'rosalie', wins: 9, losses: 6 },
    ],
  },
];

const PLAYERS: StandingsPlayer[] = [
  { playerId: 'dale', displayName: 'Dale D.', eligible: true },
  { playerId: 'jen', displayName: 'Jen K.', eligible: true },
  { playerId: 'rosalie', displayName: 'Rosalie M.', eligible: true },
  { playerId: 'guest', displayName: 'Guest G.', eligible: false },
];

describe('buildStandings', () => {
  const rows = buildStandings(WEEKS, PLAYERS);

  it('adds up the final weeks, by hand-checked numbers', () => {
    expect(
      rows.map((r) => [r.displayName, r.wins, r.losses, r.weeksPlayed, r.weeklyTitles]),
    ).toEqual([
      ['Dale D.', 19, 11, 2, 1],
      ['Jen K.', 19, 11, 2, 1],
      ['Rosalie M.', 9, 6, 1, 0],
    ]);
  });

  it('leaves out a week that is not final yet', () => {
    expect(rows.find((r) => r.playerId === 'dale')?.weekRecords).toEqual({
      wk01: { wins: 11, losses: 4 },
      wk02: { wins: 8, losses: 7 },
    });
    expect(rows.find((r) => r.playerId === 'rosalie')?.weekRecords).toEqual({
      wk01: { wins: 9, losses: 6 },
    });
  });

  it('keeps guest-only players weekly only, even with the best week', () => {
    expect(rows.map((r) => r.playerId)).not.toContain('guest');
  });

  it('ranks by correct picks, then win rate, then name', () => {
    const ranked = buildStandings(
      [
        {
          weekId: 'wk01',
          weekNumber: 1,
          status: 'final',
          winnerIds: [],
          records: [
            { playerId: 'a', wins: 10, losses: 5 },
            { playerId: 'b', wins: 10, losses: 4 }, // one tied game on a 14-game sheet is still a loss; fewer losses here
            { playerId: 'c', wins: 12, losses: 3 },
          ],
        },
      ],
      [
        { playerId: 'a', displayName: 'Zed', eligible: true },
        { playerId: 'b', displayName: 'Amy', eligible: true },
        { playerId: 'c', displayName: 'Cal', eligible: true },
      ],
    );
    expect(ranked.map((r) => r.displayName)).toEqual(['Cal', 'Amy', 'Zed']);
  });

  it('counts a split pot as a title for each winner', () => {
    const split = buildStandings([{ ...WEEKS[0], winnerIds: ['dale', 'jen'] }], PLAYERS);
    expect(split.map((r) => [r.playerId, r.weeklyTitles])).toEqual([
      ['dale', 1],
      ['jen', 1],
      ['rosalie', 0],
    ]);
  });

  it('is empty before any week is final', () => {
    expect(buildStandings([WEEKS[2]], PLAYERS)).toEqual([]);
  });
});

describe('standingPlaces, winPercent, bestWeek', () => {
  const rows = buildStandings(WEEKS, PLAYERS);

  it('shares a place when players are level on correct picks', () => {
    expect(standingPlaces(rows)).toEqual([
      { place: 1, tied: true },
      { place: 1, tied: true },
      { place: 3, tied: false },
    ]);
  });

  it('shows a win rate as a whole percent', () => {
    expect(winPercent({ wins: 19, losses: 11 })).toBe('63%');
    expect(winPercent({ wins: 0, losses: 0 })).toBe('–');
    expect(winPercent({ wins: 15, losses: 0 })).toBe('100%');
  });

  it('finds the best week, taking the earlier one when two are level', () => {
    expect(bestWeek(rows[0].weekRecords)).toEqual({ weekId: 'wk01', wins: 11, losses: 4 });
    expect(bestWeek({ wk02: { wins: 9, losses: 6 }, wk01: { wins: 9, losses: 5 } })).toEqual({
      weekId: 'wk01',
      wins: 9,
      losses: 5,
    });
    expect(bestWeek({})).toBeNull();
  });
});

describe('buildAllTime', () => {
  it('adds every final week across seasons, for every player including guests', () => {
    const stats = buildAllTime([
      { year: '2027', weeks: [{ ...WEEKS[0], winnerIds: ['dale'] }] },
      { year: '2026', weeks: WEEKS },
    ]);
    expect(stats.get('dale')).toEqual({
      weeksPlayed: 3,
      wins: 30,
      losses: 15,
      weeklyTitles: 2,
      bestWeekRecord: { wins: 11, losses: 4 },
      lastPlayedWeek: '2027/wk01',
    });
    expect(stats.get('guest')).toMatchObject({ weeksPlayed: 2, wins: 24, weeklyTitles: 0 });
    expect(stats.get('rosalie')?.lastPlayedWeek).toBe('2027/wk01');
    expect(stats.get('jen')).toMatchObject({ weeksPlayed: 3, lastPlayedWeek: '2027/wk01' });
  });
});
