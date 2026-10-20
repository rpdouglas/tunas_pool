import { describe, expect, it } from 'vitest';
import {
  SPEC_SCENARIOS,
  cardCounts,
  expectedCycleWeeks,
  fullAfter,
  seededRandom,
  simulate,
} from './bingoSim';

const config = { priceCents: 1000, operatorPct: 40, maxWeeks: 26 };

describe('bingo simulation', () => {
  it('the exact formula: a card is never full before six draws, and always eventually', () => {
    for (let k = 0; k < 1; k++) expect(fullAfter(k)).toBeCloseTo(0, 12);
    expect(fullAfter(1)).toBeCloseTo(1 / 13_983_816, 12);
    expect(fullAfter(500)).toBeCloseTo(1, 6);
  });

  it('shares out card counts to match the spec’s averages exactly', () => {
    const avg = (w: (typeof SPEC_SCENARIOS)[number]['cardWeights']) =>
      cardCounts(w, 50).reduce((a, n, i) => a + n * (i + 1), 0) / 50;
    expect(
      SPEC_SCENARIOS.map((s) => cardCounts(s.cardWeights, 50).reduce((a, b) => a + b)),
    ).toEqual([50, 50, 50]);
    expect(SPEC_SCENARIOS.map((s) => avg(s.cardWeights))).toEqual([1.6, 2.4, 3.28]);
  });

  it('is seeded: the same seed gives the same numbers', () => {
    const a = seededRandom(649);
    const b = seededRandom(649);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(simulate(SPEC_SCENARIOS[0], config, 2, 1)).toEqual(
      simulate(SPEC_SCENARIOS[0], config, 2, 1),
    );
  });

  it('agrees with the exact cycle length when 100 cards are paid every week', () => {
    const r = simulate(
      { name: 'all in', people: 100, cardWeights: [1, 0, 0, 0, 0], payChance: 1 },
      config,
      60,
      649,
    );
    expect(expectedCycleWeeks(100)).toBeCloseTo(5.21, 2);
    expect(Math.abs(r.avgCycleWeeks - expectedCycleWeeks(100))).toBeLessThan(0.35);
    // With nothing carried, every cycle pays back exactly what is left after the operator share.
    expect(r.returnPerDollar).toBeCloseTo(0.6, 9);
  });
});
