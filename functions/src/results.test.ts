import { describe, expect, it } from 'vitest';
import { sameResults, validateResultsInput } from './results';

const games = ['g01', 'g02', 'mnf'];

describe('validateResultsInput', () => {
  it('accepts winners, ties, a partial list, and the Monday night total', () => {
    expect(validateResultsInput(games, { g01: 'home', g02: 'tie' }, 46)).toEqual({
      ok: true,
      results: { g01: 'home', g02: 'tie' },
      mnfTotal: 46,
    });
    expect(validateResultsInput(games, {}, null)).toEqual({
      ok: true,
      results: {},
      mnfTotal: null,
    });
    expect(validateResultsInput(games, { mnf: 'away' }, 0)).toMatchObject({
      ok: true,
      mnfTotal: 0,
    });
  });

  it('rejects games that are not on the sheet, and results that are not a winner or a tie', () => {
    expect(validateResultsInput(games, { g99: 'home' }, null)).toMatchObject({ ok: false });
    expect(validateResultsInput(games, { g01: 'draw' }, null)).toMatchObject({ ok: false });
    expect(validateResultsInput(games, ['home'], null)).toMatchObject({ ok: false });
    expect(validateResultsInput(games, null, null)).toMatchObject({ ok: false });
  });

  it('needs the total to be a whole number from 0 to 200', () => {
    for (const bad of [-1, 201, 45.5, '46', NaN]) {
      expect(validateResultsInput(games, {}, bad)).toMatchObject({ ok: false });
    }
  });
});

describe('sameResults', () => {
  it('compares results regardless of order, and treats missing as empty', () => {
    expect(sameResults({ g01: 'home', g02: 'away' }, { g02: 'away', g01: 'home' })).toBe(true);
    expect(sameResults(undefined, {})).toBe(true);
    expect(sameResults({ g01: 'home' }, { g01: 'away' })).toBe(false);
    expect(sameResults({ g01: 'home' }, {})).toBe(false);
  });
});
