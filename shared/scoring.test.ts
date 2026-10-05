import {
  bestPossibleWins,
  explainOutcome,
  formatMoney,
  formatRecord,
  pickWinners,
  scorePicks,
  type Contender,
} from './scoring';

const FEE = 2000;
const options = { entryFeeCents: FEE, unpaidEligibleToWin: false };

const person = (
  playerId: string,
  wins: number,
  tiebreakerTotal: number | null,
  overrides: Partial<Contender> = {},
): Contender => ({
  playerId,
  displayName: playerId.toUpperCase(),
  wins,
  losses: 15 - wins,
  tiebreakerTotal,
  paid: true,
  ...overrides,
});

describe('scorePicks', () => {
  const ids = ['g01', 'g02', 'g03', 'g04'];

  it('counts correct picks as wins and wrong or missing picks as losses', () => {
    const scored = scorePicks(
      { g01: 'home', g02: 'away', g03: 'home' }, // g04 missing
      { g01: 'home', g02: 'home', g03: 'home', g04: 'away' },
      ids,
    );
    expect(scored).toEqual({ wins: 2, losses: 2, remaining: 0 });
  });

  it('leaves games without a result as remaining, and computes the best possible wins', () => {
    const scored = scorePicks({ g01: 'home', g02: 'home' }, { g01: 'home', g02: 'away' }, ids);
    expect(scored).toEqual({ wins: 1, losses: 1, remaining: 2 });
    expect(bestPossibleWins(scored)).toBe(3);
  });

  it('a tied game is not a win for anyone by default, and counts toward losses (D-008, D-046)', () => {
    const scored = scorePicks({ g01: 'home', g02: 'away' }, { g01: 'tie', g02: 'tie' }, [
      'g01',
      'g02',
    ]);
    expect(scored).toEqual({ wins: 0, losses: 2, remaining: 0 });
  });

  it('supports the other tie rules from the pool settings', () => {
    const picks = { g01: 'home' } as const;
    expect(scorePicks(picks, { g01: 'tie' }, ['g01'], 'win_for_all')).toEqual({
      wins: 1,
      losses: 0,
      remaining: 0,
    });
    expect(scorePicks(picks, { g01: 'tie' }, ['g01'], 'half_win')).toEqual({
      wins: 0.5,
      losses: 0.5,
      remaining: 0,
    });
  });

  it('ignores picks for games that are not on the sheet', () => {
    expect(scorePicks({ g01: 'home', zzz: 'home' }, { g01: 'home', zzz: 'home' }, ['g01'])).toEqual(
      {
        wins: 1,
        losses: 0,
        remaining: 0,
      },
    );
  });
});

describe('pickWinners', () => {
  it('the entry with the most wins wins, with no tiebreaker needed', () => {
    const result = pickWinners(
      [person('a', 11, 40), person('b', 10, 46), person('c', 9, 46)],
      null,
      options,
    );
    expect(result.ok && result.outcome).toMatchObject({
      playerIds: ['a'],
      decision: 'most_wins',
      potCents: 3 * FEE,
      shareCents: 3 * FEE,
      leftoverCents: 0,
    });
  });

  it('paper sheet example: the total is 46, a guess of 58 beats a guess of 45', () => {
    const result = pickWinners([person('a', 11, 58), person('b', 11, 45)], 46, options);
    expect(result.ok && result.outcome).toMatchObject({
      playerIds: ['a'],
      decision: 'tiebreaker',
      mnfPrediction: 58,
      tiedPlayerIds: ['a', 'b'],
    });
  });

  it('among guesses at or over the total, the lowest wins', () => {
    const result = pickWinners(
      [person('a', 11, 70), person('b', 11, 47), person('c', 11, 52), person('d', 11, 40)],
      46,
      options,
    );
    expect(result.ok && result.outcome.playerIds).toEqual(['b']);
  });

  it('a guess exactly equal to the total counts as at or over', () => {
    const result = pickWinners([person('a', 11, 46), person('b', 11, 47)], 46, options);
    expect(result.ok && result.outcome.playerIds).toEqual(['a']);
  });

  it('when everyone guessed under the total, the highest (closest) guess wins', () => {
    const result = pickWinners(
      [person('a', 11, 40), person('b', 11, 44), person('c', 11, 30)],
      46,
      options,
    );
    expect(result.ok && result.outcome).toMatchObject({
      playerIds: ['b'],
      decision: 'tiebreaker',
      mnfPrediction: 44,
    });
  });

  it('entries that share the winning guess split the pot; leftover cents are reported', () => {
    // 41 paid entries: $820, three winners, $273.33 each and 1 cent left over.
    const field = Array.from({ length: 38 }, (_, i) => person(`x${i}`, 5, 10));
    const result = pickWinners(
      [person('a', 12, 50), person('b', 12, 50), person('c', 12, 50), ...field],
      46,
      options,
    );
    expect(result.ok && result.outcome).toMatchObject({
      playerIds: ['a', 'b', 'c'],
      decision: 'split_pot',
      potCents: 82_000,
      shareCents: 27_333,
      leftoverCents: 1,
    });
  });

  it('a clean two-way split has nothing left over', () => {
    const result = pickWinners(
      [person('a', 12, 50), person('b', 12, 50), person('c', 3, 1), person('d', 3, 1)],
      46,
      options,
    );
    expect(result.ok && result.outcome).toMatchObject({
      shareCents: 2 * FEE,
      leftoverCents: 0,
      decision: 'split_pot',
    });
  });

  it('unpaid entries cannot win, even with the best record (D-009), and do not add to the pot', () => {
    const result = pickWinners(
      [person('a', 14, 40, { paid: false }), person('b', 9, 40), person('c', 8, 40)],
      46,
      options,
    );
    expect(result.ok && result.outcome).toMatchObject({ playerIds: ['b'], potCents: 2 * FEE });
  });

  it('can let unpaid entries win when the pool setting allows it, but the pot is still only paid entries', () => {
    const result = pickWinners([person('a', 14, 40, { paid: false }), person('b', 9, 40)], 46, {
      ...options,
      unpaidEligibleToWin: true,
    });
    expect(result.ok && result.outcome).toMatchObject({ playerIds: ['a'], potCents: FEE });
  });

  it('has no winner when nobody is eligible', () => {
    expect(pickWinners([person('a', 14, 40, { paid: false })], 46, options)).toEqual({
      ok: false,
      reason: 'no_eligible_entries',
    });
    expect(pickWinners([], 46, options)).toEqual({ ok: false, reason: 'no_eligible_entries' });
  });

  it('needs the Monday night total only when there is a tie to break', () => {
    expect(pickWinners([person('a', 11, 50), person('b', 11, 45)], null, options)).toEqual({
      ok: false,
      reason: 'needs_mnf_total',
    });
    expect(pickWinners([person('a', 12, 50), person('b', 11, 45)], null, options).ok).toBe(true);
  });

  it('entries with no guess lose a tiebreaker to entries with one', () => {
    const result = pickWinners([person('a', 11, null), person('b', 11, 30)], 46, options);
    expect(result.ok && result.outcome.playerIds).toEqual(['b']);
  });

  it('a single paid entry wins the whole pot', () => {
    const result = pickWinners([person('a', 0, null)], null, options);
    expect(result.ok && result.outcome).toMatchObject({
      playerIds: ['a'],
      potCents: FEE,
      shareCents: FEE,
    });
  });
});

describe('explaining the outcome', () => {
  const names = (ids: string[]) => ids.map((i) => i.toUpperCase());

  it('says who had the most picks', () => {
    const result = pickWinners([person('a', 11, 40), person('b', 9, 40)], null, options);
    if (!result.ok) throw new Error('expected a winner');
    expect(explainOutcome(result.outcome, null, names(result.outcome.tiedPlayerIds))).toBe(
      'A had the most correct picks (11 – 4).',
    );
  });

  it('explains a tiebreaker won at or over the total, and one won under it', () => {
    const over = pickWinners([person('a', 11, 58), person('b', 11, 45)], 46, options);
    const under = pickWinners([person('a', 11, 40), person('b', 11, 44)], 46, options);
    if (!over.ok || !under.ok) throw new Error('expected winners');
    expect(explainOutcome(over.outcome, 46, ['A', 'B'])).toBe(
      "2 players tied at 11 – 4. The tiebreaker decided it: the Monday night total was 46, and A's guess of 58 was the closest at or over it.",
    );
    expect(explainOutcome(under.outcome, 46, ['A', 'B'])).toBe(
      "2 players tied at 11 – 4. The tiebreaker decided it: the Monday night total was 46. Nobody guessed at or over it, so B's guess of 44, the closest under it, won.",
    );
  });

  it('explains a split pot', () => {
    const split = pickWinners([person('a', 12, 50), person('b', 12, 50)], 46, options);
    if (!split.ok) throw new Error('expected winners');
    expect(explainOutcome(split.outcome, 46, ['A', 'B'])).toBe(
      '2 players tied at 12 – 3. A and B all guessed 50, the closest to the Monday night total of 46, so they split the pot.',
    );
  });
});

describe('formatting', () => {
  it('formats records and money', () => {
    expect(formatRecord(11, 4)).toBe('11 – 4');
    expect(formatMoney(82_000)).toBe('$820');
    expect(formatMoney(27_333)).toBe('$273.33');
  });
});
