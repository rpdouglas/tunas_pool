/**
 * Tunas 649 Bingo economics, simulated on the game's own rules (shared/bingoSim.ts, R-23).
 *
 *   npx tsx scripts/bingo-sim.ts [years=300] [seed=649] [priceCents=1000] [operatorPct=40]
 *
 * Seeded, so the same arguments always print the same table.
 */
import { SPEC_SCENARIOS, simulate } from '../shared/bingoSim';

const [years = 300, seed = 649, priceCents = 1000, operatorPct = 40] = process.argv
  .slice(2)
  .map(Number);

const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-CA')}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

console.log(
  `Tunas 649 Bingo · ${years} years per case · seed ${seed} · $${priceCents / 100} a card · ${operatorPct}% operator · cap 26 weeks\n`,
);
const rows = SPEC_SCENARIOS.map((s, i) =>
  simulate(s, { priceCents, operatorPct, maxWeeks: 26 }, years, seed + i),
);
console.table(
  rows.map((r) => ({
    Case: r.scenario,
    'Cards/person': r.avgCardsPerPerson.toFixed(1),
    'Paid cards/wk': Math.round(r.paidCardsPerWeek),
    'Revenue/yr': dollars(r.revenuePerYearCents),
    'Operator/yr': dollars(r.operatorPerYearCents),
    'Cycles/yr': r.cyclesPerYear.toFixed(1),
    'Avg weeks': r.avgCycleWeeks.toFixed(1),
    'Avg pot': dollars(r.avgPotCents),
    Ties: pct(r.tieRate),
    Capped: pct(r.capRate),
    '¢ back per $': Math.round(r.returnPerDollar * 100),
    'Spend from 4-5 card': pct(r.spendShareHeavy),
  })),
);
