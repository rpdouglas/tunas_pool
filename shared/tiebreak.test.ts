import { describe, expect, it } from 'vitest';
import { byTiebreakRule, tiebreakSummary } from './tiebreak';

const entry = (playerId: string, displayName: string, tiebreakerTotal: number | null) => ({
  playerId,
  displayName,
  tiebreakerTotal,
});

describe('byTiebreakRule', () => {
  it('puts the lowest guess at or over the total first, as on the paper sheet (46: 58 beats 45)', () => {
    const ordered = byTiebreakRule([{ guess: 45 }, { guess: 58 }, { guess: 50 }], 46);
    expect(ordered.map((g) => g.guess)).toEqual([50, 58, 45]);
  });

  it('when everyone is under, the highest guess comes first', () => {
    expect(byTiebreakRule([{ guess: 30 }, { guess: 40 }], 46).map((g) => g.guess)).toEqual([
      40, 30,
    ]);
  });

  it('with no total yet, simply lowest first', () => {
    expect(byTiebreakRule([{ guess: 50 }, { guess: 30 }], null).map((g) => g.guess)).toEqual([
      30, 50,
    ]);
  });
});

describe('tiebreakSummary', () => {
  const entries = [
    entry('dale', 'Dale D.', 44),
    entry('jen', 'Jen K.', 50),
    entry('pat', 'Pat', 38),
    entry('lou', 'Lou', 61),
    entry('paper', 'Paper Only', null),
  ];

  it('gives the range, the middle, and your guess, leaving out a missing guess', () => {
    const s = tiebreakSummary(entries, 31, 'jen', ['dale']);
    expect(s.guesses.map((g) => g.guess)).toEqual([38, 44, 50, 61]);
    expect([s.low, s.high, s.middle, s.mine]).toEqual([38, 61, 47, 50]);
    // One leader: no tiebreak to show.
    expect(s.leaders).toEqual([]);
  });

  it('orders the players tied for the lead by the rule against the total so far', () => {
    const s = tiebreakSummary(entries, 47, null, ['dale', 'jen', 'lou']);
    expect(s.leaders.map((l) => [l.displayName, l.atOrOver])).toEqual([
      ['Jen K.', true],
      ['Lou', true],
      ['Dale D.', false],
    ]);
    expect(tiebreakSummary(entries, null, null, ['dale', 'jen']).leaders[0].atOrOver).toBeNull();
  });

  it('copes with nobody guessing', () => {
    expect(tiebreakSummary([], 10, 'x', [])).toMatchObject({
      low: null,
      high: null,
      middle: null,
      mine: null,
    });
  });
});
