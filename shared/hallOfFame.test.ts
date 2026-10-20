import { describe, expect, it } from 'vitest';
import { careers, hallOfFame, topPlaces, weekName, type HallSeason } from './hallOfFame';
import type { StandingRow } from './standings';

const row = (
  playerId: string,
  displayName: string,
  weeklyTitles: number,
  weekRecords: Record<string, [number, number]>,
): StandingRow => {
  const records = Object.fromEntries(
    Object.entries(weekRecords).map(([w, [wins, losses]]) => [w, { wins, losses }]),
  );
  const values = Object.values(records);
  return {
    playerId,
    displayName,
    weeksPlayed: values.length,
    wins: values.reduce((n, r) => n + r.wins, 0),
    losses: values.reduce((n, r) => n + r.losses, 0),
    weeklyTitles,
    weekRecords: records,
  };
};

// Six weeks of 2026 and two of 2027 (Dale changed his name between seasons).
const SEASONS: HallSeason[] = [
  {
    year: '2026',
    rows: [
      row('dale', 'Dale', 2, {
        wk05: [12, 3],
        wk06: [15, 0],
        wk07: [10, 4],
        wk08: [9, 5],
        wk09: [11, 4],
      }),
      row('jen', 'Jen K.', 1, { wk05: [11, 4], wk06: [13, 2], wk07: [14, 0] }),
      row('pat', 'Pat', 0, {
        wk05: [8, 7],
        wk06: [9, 6],
        wk07: [8, 6],
        wk08: [7, 7],
        wk09: [9, 6],
        wk10: [8, 7],
      }),
    ],
  },
  {
    year: '2027',
    rows: [
      row('dale', 'Dale D.', 1, { wk01: [13, 3] }),
      row('jen', 'Jen K.', 0, { wk01: [9, 7], wk02: [10, 5] }),
    ],
  },
];

const byKey = (key: string) => hallOfFame(SEASONS).find((l) => l.key === key)!;
const names = (key: string) => byKey(key).entries.map((e) => e.displayName);

describe('weekName', () => {
  it('reads a week ID as the NFL week', () => {
    expect(weekName('wk07')).toBe('Week 7');
    expect(weekName('wk18')).toBe('Week 18');
  });
});

describe('careers', () => {
  it('adds up every season under the latest name, and counts perfect weeks', () => {
    const dale = careers(SEASONS).find((c) => c.playerId === 'dale')!;
    expect(dale).toMatchObject({
      displayName: 'Dale D.',
      weeksPlayed: 6,
      wins: 70,
      losses: 19,
      weeklyTitles: 3,
      perfectWeeks: 1,
      best: { wins: 15, losses: 0, year: '2026', weekId: 'wk06' },
    });
  });

  it('a week with a tied game (a miss for everyone, D-008) is not perfect', () => {
    const tie = careers([{ year: '2026', rows: [row('x', 'X', 0, { wk05: [14, 1] })] }])[0];
    expect(tie.perfectWeeks).toBe(0);
  });
});

describe('hallOfFame', () => {
  it('lists the five records in order, and never a streak or money', () => {
    const lists = hallOfFame(SEASONS);
    expect(lists.map((l) => l.title)).toEqual([
      'Most weekly wins',
      'Best pick rate',
      'Best single week',
      'Most perfect weeks',
      'Most weeks played',
    ]);
    const words = JSON.stringify(lists);
    expect(words).not.toMatch(/streak|\$|pot won|worst/i);
  });

  it('most weekly wins leaves out players with none', () => {
    expect(byKey('titles').entries.map((e) => [e.displayName, e.value])).toEqual([
      ['Dale D.', '3 weeks won'],
      ['Jen K.', '1 week won'],
    ]);
  });

  it('pick rate needs five weeks, so one great week can’t top it', () => {
    // Jen is 57-18 (76%) but over five weeks; Dale is 70-19 (79%) over six; Pat is 49-39.
    const rate = byKey('rate');
    expect(rate.entries.map((e) => [e.displayName, e.value, e.detail])).toEqual([
      ['Dale D.', '79% right', '70 – 19 over 6 weeks'],
      ['Jen K.', '76% right', '57 – 18 over 5 weeks'],
      ['Pat', '56% right', '49 – 39 over 6 weeks'],
    ]);
    const short = hallOfFame([{ year: '2026', rows: [row('x', 'X', 0, { wk05: [15, 0] })] }]);
    expect(short.find((l) => l.key === 'rate')!.entries).toEqual([]);
  });

  it('best single week is each player’s best, with the week it happened', () => {
    expect(byKey('bestWeek').entries.map((e) => [e.displayName, e.value, e.detail])).toEqual([
      ['Dale D.', '15 of 15 right', 'Week 6, 2026'],
      ['Jen K.', '14 of 14 right', 'Week 7, 2026'],
      ['Pat', '9 of 15 right', 'Week 6, 2026'],
    ]);
  });

  it('perfect weeks and weeks played', () => {
    expect(byKey('perfect').entries.map((e) => [e.displayName, e.value])).toEqual([
      ['Dale D.', '1 perfect week'],
      ['Jen K.', '1 perfect week'],
    ]);
    expect(byKey('perfect').entries.every((e) => e.place === 1 && e.tied)).toBe(true);
    expect(names('weeks')).toEqual(['Dale D.', 'Pat', 'Jen K.']);
    expect(byKey('weeks').entries[1]).toMatchObject({ place: 1, tied: true, value: '6 weeks' });
  });

  it('says so when a list is empty', () => {
    const lists = hallOfFame([]);
    expect(lists.every((l) => l.entries.length === 0 && l.empty.length > 0)).toBe(true);
  });
});

describe('topPlaces', () => {
  const people = (scores: number[]) =>
    scores.map((score, i) => ({ displayName: `P${String(i).padStart(2, '0')}`, score }));

  it('shows the top five places, sharing places on a tie', () => {
    const r = topPlaces(people([9, 8, 8, 7, 6, 5, 4]), (p) => p.score);
    expect(r.rows.map((x) => x.place)).toEqual([1, 2, 2, 4, 5]);
    expect(r.more).toBe(0);
  });

  it('a tie running past the list is cut and counted', () => {
    const r = topPlaces(people([9, 8, 7, 7, 7, 7, 7, 7, 7, 7]), (p) => p.score);
    expect(r.rows.map((x) => x.item.score)).toEqual([9, 8]);
    expect([r.more, r.cut?.score]).toEqual([8, 7]);
  });

  it('a tie for first longer than the list keeps the first rows and counts the rest', () => {
    const r = topPlaces(people(Array(10).fill(5)), (p) => p.score);
    expect(r.rows).toHaveLength(8);
    expect(r.more).toBe(2);
  });
});
