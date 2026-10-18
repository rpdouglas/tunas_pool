/**
 * The import screen's logic (D-096): who each spreadsheet row is on the roster, and what saving it
 * would do next to the entries already in this week. Pure, unit tested. Picks already in, whether
 * typed on the website or entered from paper, are kept unless the commissioner ticks Replace.
 */
import { normalizeName, similarNames } from '@shared/duplicates';
import type { SheetRow } from '@shared/picksImport';
import type { Pick } from '@shared/types';
import type { RosterPlayer } from '../roster/roster';

/** Who a row is: a roster player, a new roster player with the row's name, or nobody (skip). */
export type RowChoice =
  { kind: 'player'; playerId: string } | { kind: 'new' } | { kind: 'skip' } | { kind: 'undecided' };

export interface RowMatch {
  exact: RosterPlayer | null;
  /** Roster players with a similar name ("Barry T" and "Barry Thompson"), when there is no exact match. */
  similar: RosterPlayer[];
}

/** An entry already in this week, with its picks when they could be read. */
export interface ExistingEntry {
  source: string;
  picks: Record<string, Pick> | null;
  tiebreakerTotal: number | null;
}

export type RowStatus =
  | { kind: 'problem'; messages: string[] }
  | { kind: 'skip' }
  | { kind: 'undecided' }
  | { kind: 'inactive'; name: string }
  | { kind: 'taken'; otherLine: number }
  | { kind: 'save'; newPlayer: boolean }
  | { kind: 'same' }
  | { kind: 'keep'; existing: ExistingEntry; differences: number }
  | { kind: 'replace'; existing: ExistingEntry; differences: number };

export function matchRow(name: string, roster: RosterPlayer[]): RowMatch {
  const key = normalizeName(name);
  const exact = roster.filter((p) => normalizeName(p.displayName) === key);
  if (exact.length === 1) return { exact: exact[0], similar: [] };
  // Two roster players with the same name: the commissioner says which one.
  if (exact.length > 1) return { exact: null, similar: exact };
  return { exact: null, similar: roster.filter((p) => similarNames(name, p.displayName)) };
}

/** An exact name is that player; a similar name waits for the commissioner; no match is a new player. */
export function defaultChoice(match: RowMatch): RowChoice {
  if (match.exact) return { kind: 'player', playerId: match.exact.playerId };
  return match.similar.length > 0 ? { kind: 'undecided' } : { kind: 'new' };
}

/** How many games the two sets of picks disagree on, counting a different tiebreaker as one. */
export function countDifferences(row: SheetRow, existing: ExistingEntry): number {
  const picks = existing.picks ?? {};
  const games = new Set([...Object.keys(row.picks), ...Object.keys(picks)]);
  let differences = 0;
  games.forEach((id) => {
    if (row.picks[id] !== picks[id]) differences++;
  });
  if (row.tiebreakerTotal !== existing.tiebreakerTotal) differences++;
  return differences;
}

export interface PlanInput {
  rows: SheetRow[];
  choices: Record<number, RowChoice>;
  /** Lines the commissioner ticked to replace picks already in. */
  replace: Set<number>;
  roster: RosterPlayer[];
  existing: Map<string, ExistingEntry>;
}

export function planRows(input: PlanInput): { row: SheetRow; status: RowStatus }[] {
  const firstLineFor = new Map<string, number>();
  return input.rows.map((row) => {
    if (row.problems.length > 0)
      return { row, status: { kind: 'problem', messages: row.problems } };
    const choice = input.choices[row.line] ?? { kind: 'undecided' };
    if (choice.kind === 'skip') return { row, status: { kind: 'skip' } };
    if (choice.kind === 'undecided') return { row, status: { kind: 'undecided' } };
    if (choice.kind === 'new') return { row, status: { kind: 'save', newPlayer: true } };

    const player = input.roster.find((p) => p.playerId === choice.playerId);
    if (!player) return { row, status: { kind: 'undecided' } };
    const earlier = firstLineFor.get(player.playerId);
    if (earlier !== undefined) return { row, status: { kind: 'taken', otherLine: earlier } };
    firstLineFor.set(player.playerId, row.line);
    if (!player.active) return { row, status: { kind: 'inactive', name: player.displayName } };

    const existing = input.existing.get(player.playerId);
    if (!existing) return { row, status: { kind: 'save', newPlayer: false } };
    const differences = countDifferences(row, existing);
    if (differences === 0) return { row, status: { kind: 'same' } };
    return {
      row,
      status: input.replace.has(row.line)
        ? { kind: 'replace', existing, differences }
        : { kind: 'keep', existing, differences },
    };
  });
}

/** True for the rows that Import would save. */
export const willSave = (status: RowStatus) => status.kind === 'save' || status.kind === 'replace';

export interface PlanCounts {
  save: number;
  newPlayers: number;
  replace: number;
  keep: number;
  same: number;
  needChoice: number;
  problems: number;
  skip: number;
}

export function planCounts(plan: { status: RowStatus }[]): PlanCounts {
  const counts: PlanCounts = {
    save: 0,
    newPlayers: 0,
    replace: 0,
    keep: 0,
    same: 0,
    needChoice: 0,
    problems: 0,
    skip: 0,
  };
  for (const { status } of plan) {
    if (willSave(status)) counts.save++;
    if (status.kind === 'save' && status.newPlayer) counts.newPlayers++;
    if (status.kind === 'replace') counts.replace++;
    if (status.kind === 'keep') counts.keep++;
    if (status.kind === 'same') counts.same++;
    if (status.kind === 'undecided') counts.needChoice++;
    if (['problem', 'inactive', 'taken'].includes(status.kind)) counts.problems++;
    if (status.kind === 'skip') counts.skip++;
  }
  return counts;
}
