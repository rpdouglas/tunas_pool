/**
 * A seeded simulation of Weekly 649 Bingo, run on the game's own rules (shared/bingo.ts), so the
 * engine and the economics are checked by the same code (BINGO_PLAN R-23). `scripts/bingo-sim.ts`
 * prints the table; a short run is in bingoSim.test.ts.
 *
 * The model: a fixed group of people, each with 1 to 5 cards kept across cycles (D-117: everyone
 * joins at a cycle's first draw). Each week a person pays for all their cards or none, with a
 * fixed chance. One draw a week (D-122). A cycle ends on a win or at `maxWeeks` (D-121).
 */
import { evaluateCycle, quickPick, type CycleDraw, type CycleEntry } from './bingo';

export interface SimScenario {
  name: string;
  people: number;
  /** Chance a person has 1, 2, 3, 4, or 5 cards. */
  cardWeights: [number, number, number, number, number];
  /** Chance a person pays for their cards in a given week. */
  payChance: number;
}

export interface SimConfig {
  priceCents: number;
  operatorPct: number;
  maxWeeks: number;
}

export interface SimResult {
  scenario: string;
  years: number;
  avgCardsPerPerson: number;
  paidCardsPerWeek: number;
  revenuePerYearCents: number;
  operatorPerYearCents: number;
  cyclesPerYear: number;
  avgCycleWeeks: number;
  avgPotCents: number;
  /** Share of won or capped cycles with more than one winning card. */
  tieRate: number;
  /** Share of cycles that hit the cap. */
  capRate: number;
  /** Winnings back per dollar spent, over completed cycles. */
  returnPerDollar: number;
  /** Share of spend from people with 4 or 5 cards. */
  spendShareHeavy: number;
}

/** Mulberry32: a small, fast, seeded generator returning [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many people get 1 to 5 cards: the weights shared out exactly (largest remainder). */
export function cardCounts(weights: SimScenario['cardWeights'], people: number): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / total) * people);
  const counts = raw.map(Math.floor);
  const order = raw
    .map((r, i) => [r - Math.floor(r), i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; counts.reduce((a, b) => a + b, 0) < people; k++) counts[order[k][1]]++;
  return counts;
}

export function simulate(
  scenario: SimScenario,
  config: SimConfig,
  years: number,
  seed: number,
): SimResult {
  const random = seededRandom(seed);
  const weeks = years * 52;
  const sizes = cardCounts(scenario.cardWeights, scenario.people).flatMap((count, i) =>
    Array.from({ length: count }, () => i + 1),
  );
  const people = sizes.map((n, p) => {
    return {
      heavy: n >= 4,
      cards: Array.from({ length: n }, (_, c) => ({
        cardId: `p${p}c${c}`,
        numbers: quickPick(random),
      })),
    };
  });
  const totalCards = people.reduce((a, p) => a + p.cards.length, 0);

  let revenue = 0;
  let operator = 0;
  let paidCards = 0;
  let spendHeavy = 0;
  let completed = 0;
  let completedWeeks = 0;
  let ties = 0;
  let capped = 0;
  let potSum = 0;
  let winnings = 0;
  let completedSpend = 0;

  let draws: CycleDraw[] = [];
  let paid = new Map<string, string[]>();
  let cycleSpend = 0;
  let carried = 0;

  for (let w = 0; w < weeks; w++) {
    const date = `w${String(w).padStart(5, '0')}`;
    for (const person of people) {
      if (random() >= scenario.payChance) continue;
      for (const card of person.cards) {
        paid.set(card.cardId, [...(paid.get(card.cardId) ?? []), date]);
        paidCards++;
        revenue += config.priceCents;
        cycleSpend += config.priceCents;
        if (person.heavy) spendHeavy += config.priceCents;
      }
    }
    draws.push({ date, status: 'approved', numbers: quickPick(random) });

    const entries: CycleEntry[] = people.flatMap((p, pi) =>
      p.cards.map((c) => ({
        cardId: c.cardId,
        playerId: `p${pi}`,
        numbers: c.numbers,
        paidDraws: paid.get(c.cardId) ?? [],
      })),
    );
    const r = evaluateCycle({ config, draws, entries, carriedInCents: carried });
    if (r.outcome.kind === 'open') continue;

    operator += r.operatorCents;
    if (r.outcome.kind === 'carried') {
      carried = r.outcome.carriedCents;
    } else {
      completed++;
      completedWeeks += r.drawsApproved;
      potSum += r.potCents;
      winnings += r.potCents;
      completedSpend += cycleSpend;
      if (r.outcome.winners.length > 1) ties++;
      if (r.outcome.kind === 'capped') capped++;
      cycleSpend = 0;
      carried = 0;
    }
    draws = [];
    paid = new Map();
  }

  return {
    scenario: scenario.name,
    years,
    avgCardsPerPerson: totalCards / scenario.people,
    paidCardsPerWeek: paidCards / weeks,
    revenuePerYearCents: revenue / years,
    operatorPerYearCents: operator / years,
    cyclesPerYear: completed / years,
    avgCycleWeeks: completed ? completedWeeks / completed : 0,
    avgPotCents: completed ? potSum / completed : 0,
    tieRate: completed ? ties / completed : 0,
    capRate: completed ? capped / completed : 0,
    returnPerDollar: completedSpend ? winnings / completedSpend : 0,
    spendShareHeavy: revenue ? spendHeavy / revenue : 0,
  };
}

/** The spec's three groups of 50 (BUILD_SPEC "Joining mid-cycle"). Assumptions, not facts. */
export const SPEC_SCENARIOS: SimScenario[] = [
  { name: 'Casual', people: 50, cardWeights: [0.6, 0.25, 0.1, 0.03, 0.02], payChance: 0.8 },
  { name: 'Mixed', people: 50, cardWeights: [0.3, 0.3, 0.2, 0.1, 0.1], payChance: 0.82 },
  { name: 'Keen', people: 50, cardWeights: [0.1, 0.2, 0.25, 0.2, 0.25], payChance: 0.87 },
];

function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Exact chance one card has all six crossed off after `draws` paid draws (inclusion–exclusion). */
export function fullAfter(draws: number): number {
  let q = 0;
  for (let j = 0; j <= 6; j++)
    q += (-1) ** j * choose(6, j) * (choose(49 - j, 6) / choose(49, 6)) ** draws;
  return q;
}

/**
 * Exact average cycle length in weeks when `cards` cards are all paid every week, with the cap.
 * The check on the simulation: with everyone paying, the two must agree.
 */
export function expectedCycleWeeks(cards: number, maxWeeks = 26): number {
  let weeks = 0;
  for (let k = 0; k < maxWeeks; k++) weeks += (1 - fullAfter(k)) ** cards;
  return weeks;
}
