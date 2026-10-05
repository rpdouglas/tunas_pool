import { describe, expect, it } from 'vitest';
import { buildSeasonReport, unpaidCsv, weeklyCsv, type ReportWeekInput } from './reports';

const GAMES = [
  { id: 'g01', away: 'Packers', home: 'Bears' },
  { id: 'mnf', away: 'Chiefs', home: 'Chargers' },
];

const WEEKS: ReportWeekInput[] = [
  {
    weekId: 'wk02',
    weekNumber: 2,
    status: 'locked',
    entryFeeCents: 2000,
    games: GAMES,
    results: { g01: 'away' },
    winner: null,
    payoutSent: false,
    entries: [
      {
        playerId: 'dale',
        displayName: 'Dale D.',
        paid: true,
        picks: { g01: 'away', mnf: 'home' },
        wins: 1,
      },
      {
        playerId: 'new',
        displayName: 'Smith, "Bo"',
        paid: false,
        picks: { g01: 'home', mnf: 'home' },
        wins: 0,
      },
    ],
  },
  {
    weekId: 'wk01',
    weekNumber: 1,
    status: 'final',
    entryFeeCents: 2000,
    games: GAMES,
    results: { g01: 'home', mnf: 'away' },
    winner: { displayNames: ['Dale D.', 'Jen K.'], potCents: 4000, shareCents: 2000 },
    payoutSent: true,
    entries: [
      {
        playerId: 'dale',
        displayName: 'Dale D.',
        paid: true,
        picks: { g01: 'home', mnf: 'away' },
        wins: 2,
      },
      {
        playerId: 'jen',
        displayName: 'Jen K.',
        paid: true,
        picks: { g01: 'away', mnf: 'away' },
        wins: 1,
      },
      {
        playerId: 'troy',
        displayName: 'Troy T.',
        paid: false,
        picks: { g01: 'away', mnf: 'home' },
        wins: 0,
      },
    ],
  },
];

describe('buildSeasonReport', () => {
  const report = buildSeasonReport('2026', WEEKS);
  const [wk1, wk2] = report.weeks;

  it('lists the weeks in order with entries, money, and the winner', () => {
    expect(report.weeks.map((w) => w.weekNumber)).toEqual([1, 2]);
    expect(wk1).toMatchObject({
      entries: 3,
      paid: 2,
      unpaid: 1,
      potCents: 4000,
      winners: ['Dale D.', 'Jen K.'],
      shareCents: 2000,
      payoutSent: true,
      unpaidNames: ['Troy T.'],
    });
  });

  it('uses paid entries times the fee until a winner is published', () => {
    expect(wk2).toMatchObject({ potCents: 2000, winners: [], shareCents: null, payoutSent: false });
  });

  it('counts new and returning players through the season', () => {
    expect([wk1.newPlayers, wk1.returningPlayers]).toEqual([3, 0]);
    expect([wk2.newPlayers, wk2.returningPlayers]).toEqual([1, 1]);
    expect(report.totals).toEqual({ weeks: 2, entries: 5, players: 4, potCents: 6000, unpaid: 2 });
  });

  it('averages correct picks to one decimal', () => {
    expect(wk1.averageWins).toBe(1);
    expect(wk2.averageWins).toBe(0.5);
    expect(
      buildSeasonReport('2026', [{ ...WEEKS[0], results: {} }]).weeks[0].averageWins,
    ).toBeNull();
  });

  it('finds the most-picked team and the biggest upset', () => {
    expect(wk1.mostPicked).toEqual({ team: 'Packers', count: 2 }); // first of the level sides, in sheet order
    expect(wk1.biggestUpset).toEqual({ winner: 'Bears', loser: 'Packers', count: 1 });
    expect(wk2.biggestUpset).toBeNull(); // half the pool had the Packers: not an upset
  });

  it('handles a week nobody entered', () => {
    const empty = buildSeasonReport('2026', [{ ...WEEKS[1], entries: [] }]).weeks[0];
    expect(empty).toMatchObject({
      entries: 0,
      averageWins: null,
      mostPicked: null,
      biggestUpset: null,
    });
  });
});

describe('CSV export', () => {
  const report = buildSeasonReport('2026', WEEKS);

  it('writes one line per week, with money in dollars', () => {
    const lines = weeklyCsv(report).trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0].startsWith('Week,Status,Entries,Paid,Unpaid,Pot,Winner')).toBe(true);
    expect(lines[1]).toBe('1,final,3,2,1,40.00,Dale D. & Jen K.,20.00,yes,3,0,1');
    expect(lines[2]).toBe('2,locked,2,1,1,20.00,,,,1,1,0.5');
  });

  it('quotes a name with a comma or a quote in it', () => {
    expect(unpaidCsv(report)).toBe(
      'Week,Status,Player\r\n1,final,Troy T.\r\n2,locked,"Smith, ""Bo"""\r\n',
    );
  });
});
