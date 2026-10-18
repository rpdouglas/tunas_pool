import { describe, expect, it } from 'vitest';
import type { SheetRow } from '@shared/picksImport';
import type { RosterPlayer } from '../roster/roster';
import {
  countDifferences,
  defaultChoice,
  matchRow,
  planCounts,
  planRows,
  type ExistingEntry,
  type PlanInput,
} from './importPlan';

const player = (playerId: string, displayName: string, active = true): RosterPlayer => ({
  playerId,
  displayName,
  phone: null,
  usualPayment: null,
  notes: null,
  active,
  origin: 'admin',
  claimed: false,
});

const row = (line: number, name: string, overrides: Partial<SheetRow> = {}): SheetRow => ({
  line,
  name,
  picks: { g01: 'home', mnf: 'away' },
  blankGameIds: [],
  tiebreakerTotal: 44,
  problems: [],
  ...overrides,
});

const ROSTER = [
  player('barry', 'Barry Thompson'),
  player('nancy', 'Nancy'),
  player('old', 'Old Timer', false),
];

describe('matchRow and defaultChoice', () => {
  it('takes an exact name, ignoring case and punctuation', () => {
    const match = matchRow('nancy.', ROSTER);
    expect(match.exact?.playerId).toBe('nancy');
    expect(defaultChoice(match)).toEqual({ kind: 'player', playerId: 'nancy' });
  });

  it('asks about a similar name instead of guessing', () => {
    const match = matchRow('Barry T', ROSTER);
    expect(match).toEqual({ exact: null, similar: [ROSTER[0]] });
    expect(defaultChoice(match)).toEqual({ kind: 'undecided' });
  });

  it('asks which one when two roster players share the name', () => {
    const match = matchRow('Nancy', [...ROSTER, player('nancy2', 'Nancy')]);
    expect(match.similar.map((p) => p.playerId)).toEqual(['nancy', 'nancy2']);
    expect(defaultChoice(match)).toEqual({ kind: 'undecided' });
  });

  it('adds a new player when nobody is close', () => {
    expect(defaultChoice(matchRow('Darkness', ROSTER))).toEqual({ kind: 'new' });
  });
});

describe('countDifferences', () => {
  const existing: ExistingEntry = {
    source: 'web',
    picks: { g01: 'home', mnf: 'away' },
    tiebreakerTotal: 44,
  };
  it('is zero for the same picks and tiebreaker', () => {
    expect(countDifferences(row(3, 'Nancy'), existing)).toBe(0);
  });
  it('counts each game and the tiebreaker', () => {
    const changed = row(3, 'Nancy', { picks: { g01: 'away' }, tiebreakerTotal: 50 });
    expect(countDifferences(changed, existing)).toBe(3);
  });
});

describe('planRows', () => {
  const base: PlanInput = {
    rows: [],
    choices: {},
    replace: new Set(),
    roster: ROSTER,
    existing: new Map(),
  };

  it('keeps picks already in unless Replace is ticked', () => {
    const existing = new Map<string, ExistingEntry>([
      ['nancy', { source: 'web', picks: { g01: 'away', mnf: 'away' }, tiebreakerTotal: 44 }],
    ]);
    const input = {
      ...base,
      rows: [row(3, 'Nancy')],
      choices: { 3: { kind: 'player', playerId: 'nancy' } } as PlanInput['choices'],
      existing,
    };
    expect(planRows(input)[0].status).toMatchObject({ kind: 'keep', differences: 1 });
    expect(planRows({ ...input, replace: new Set([3]) })[0].status).toMatchObject({
      kind: 'replace',
    });
  });

  it('has nothing to do when the same picks are already in', () => {
    const existing = new Map<string, ExistingEntry>([
      ['nancy', { source: 'paper', picks: { g01: 'home', mnf: 'away' }, tiebreakerTotal: 44 }],
    ]);
    const plan = planRows({
      ...base,
      rows: [row(3, 'Nancy')],
      choices: { 3: { kind: 'player', playerId: 'nancy' } },
      existing,
    });
    expect(plan[0].status).toEqual({ kind: 'same' });
  });

  it('refuses two rows for one player, an inactive player, and a row with problems', () => {
    const plan = planRows({
      ...base,
      rows: [
        row(3, 'Nancy'),
        row(4, 'Nance'),
        row(5, 'Old Timer'),
        row(6, 'Pat', { problems: ['No tiebreaker.'] }),
      ],
      choices: {
        3: { kind: 'player', playerId: 'nancy' },
        4: { kind: 'player', playerId: 'nancy' },
        5: { kind: 'player', playerId: 'old' },
        6: { kind: 'new' },
      },
    });
    expect(plan.map((p) => p.status)).toEqual([
      { kind: 'save', newPlayer: false },
      { kind: 'taken', otherLine: 3 },
      { kind: 'inactive', name: 'Old Timer' },
      { kind: 'problem', messages: ['No tiebreaker.'] },
    ]);
  });

  it('counts what Import would do', () => {
    const plan = planRows({
      ...base,
      rows: [row(3, 'Nancy'), row(4, 'Darkness'), row(5, 'Barry T'), row(6, 'Skip Me')],
      choices: {
        3: { kind: 'player', playerId: 'nancy' },
        4: { kind: 'new' },
        5: { kind: 'undecided' },
        6: { kind: 'skip' },
      },
    });
    expect(planCounts(plan)).toEqual({
      save: 2,
      newPlayers: 1,
      replace: 0,
      keep: 0,
      same: 0,
      needChoice: 1,
      problems: 0,
      skip: 1,
    });
  });
});
