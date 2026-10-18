/**
 * Reading a week of picks from a spreadsheet saved as CSV (D-096): the commissioner's master
 * sheet, one row per player. Pure, so every case is unit tested. Nothing here saves anything: the
 * import screen shows what it read, and each row is then saved through `adminUpsertEntry` like a
 * paper sheet.
 *
 * The layout it expects is the one the commissioner keeps:
 *
 *   Participant, G1, G2, ..., MNF, TB Pts, Record, Paid?
 *   Matchup, Texans at Jaguars (London), Bears at Falcons, ..., Total, W-L, Paid / Down   (optional)
 *   Tuna, Jaguars, Falcons, ..., 49ers, 49, 0-0,
 *   ...
 *   (a blank line, then totals that are not read)
 *
 * A pick is a team name, so it finds its game by team. The "Matchup" row, when there is one, is
 * only a check that each column is the game it says it is.
 */
import { MAX_TIEBREAKER } from './paperEntry';
import { resolveTeam, suggestTeam, type TeamName } from './teams';
import type { Pick } from './types';

export interface ImportGame {
  id: string;
  order: number;
  away: string;
  home: string;
}

export interface SheetRow {
  /** 1-based line in the file, as a spreadsheet would number it. */
  line: number;
  name: string;
  picks: Record<string, Pick>;
  /** Games on this week's sheet with no pick in this row: they score as a miss. */
  blankGameIds: string[];
  tiebreakerTotal: number | null;
  /** Anything that stops this row being imported, in plain words. */
  problems: string[];
}

export interface PicksSheet {
  rows: SheetRow[];
  /** Problems with the whole file. Nothing can be imported until they are fixed. */
  problems: string[];
  /** Worth knowing, but nothing is wrong. */
  notes: string[];
}

export const MAX_IMPORT_NAME_LENGTH = 60;

const NAME_HEADERS = ['participant', 'participants', 'name', 'player', 'players'];

/** Splits CSV text into rows of cells, with quoted cells and the line each row starts on. */
export function parseCsv(text: string): { line: number; cells: string[] }[] {
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      cells.push(cell);
      rows.push({ line: rowLine, cells });
      cells = [];
      cell = '';
      line++;
      rowLine = line;
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || cells.length > 0) {
    cells.push(cell);
    rows.push({ line: rowLine, cells });
  }
  return rows;
}

const clean = (value: string | undefined) => (value ?? '').trim().replace(/\s+/g, ' ');
const isBlankRow = (cells: string[]) => cells.every((c) => clean(c) === '');
const gameLabel = (g: ImportGame) => `${g.away} at ${g.home}`;

type ColumnKind = { kind: 'game' } | { kind: 'tiebreaker' } | { kind: 'other' };

function columnKind(header: string): ColumnKind {
  const h = header.toLowerCase();
  if (/^(g|game)\s*\d+$/.test(h) || h === 'mnf' || h.startsWith('monday')) return { kind: 'game' };
  if (/^tb\b/.test(h) || h.includes('tiebreak')) return { kind: 'tiebreaker' };
  return { kind: 'other' };
}

const MATCHUP_RE = /^(.+?)\s+(?:at|@|vs\.?)\s+(.+?)(?:\s*[([][^)\]]*[)\]])?$/i;

/** The week's game holding this team, or null if the team isn't playing this week. */
function gameForTeam(team: TeamName, games: ImportGame[]): ImportGame | null {
  return games.find((g) => resolveTeam(g.away) === team || resolveTeam(g.home) === team) ?? null;
}

function sideOf(team: TeamName, game: ImportGame): Pick {
  return resolveTeam(game.home) === team ? 'home' : 'away';
}

export function readPicksSheet(text: string, games: ImportGame[]): PicksSheet {
  const problems: string[] = [];
  const notes: string[] = [];
  const all = parseCsv(text);

  const headerIndex = all.findIndex((r) => NAME_HEADERS.includes(clean(r.cells[0]).toLowerCase()));
  if (headerIndex < 0) {
    return {
      rows: [],
      problems: [
        "Couldn't find the heading row. The first column should be headed Participant or Name.",
      ],
      notes,
    };
  }
  const headers = all[headerIndex].cells.map(clean);
  const gameColumns: number[] = [];
  let tiebreakerColumn: number | null = null;
  headers.forEach((h, i) => {
    if (i === 0) return;
    const kind = columnKind(h).kind;
    if (kind === 'game') gameColumns.push(i);
    if (kind === 'tiebreaker' && tiebreakerColumn === null) tiebreakerColumn = i;
  });
  if (gameColumns.length === 0) {
    problems.push('No game columns found. Head them G1, G2, and so on, and MNF.');
  }
  if (tiebreakerColumn === null) {
    problems.push('No tiebreaker column found. Head it TB Pts or Tiebreaker.');
  }

  // The optional "Matchup" row says which game each column is.
  let next = headerIndex + 1;
  const columnGame = new Map<number, ImportGame>();
  if (clean(all[next]?.cells[0]).toLowerCase().startsWith('matchup')) {
    const cells = all[next].cells;
    const seen = new Map<string, string>();
    for (const col of gameColumns) {
      const typed = clean(cells[col]);
      const m = MATCHUP_RE.exec(typed);
      const away = m ? resolveTeam(m[1]) : null;
      const home = m ? resolveTeam(m[2]) : null;
      const game = away && home ? gameForTeam(away, games) : null;
      if (!typed) continue;
      if (!game || !home || gameForTeam(home, games) !== game) {
        problems.push(
          `Column ${headers[col]} says "${typed}", which isn't one of this week's games. Check the week is the right one.`,
        );
        continue;
      }
      if (seen.has(game.id)) {
        problems.push(
          `Columns ${seen.get(game.id)} and ${headers[col]} are both ${gameLabel(game)}.`,
        );
        continue;
      }
      seen.set(game.id, headers[col]);
      columnGame.set(col, game);
    }
    const missing = games.filter((g) => !seen.has(g.id));
    if (missing.length > 0 && seen.size > 0) {
      notes.push(
        `Not on the spreadsheet: ${missing.map(gameLabel).join(', ')}. Those picks are left blank.`,
      );
    }
    next++;
  }

  const paidColumn = headers.findIndex((h, i) => i > 0 && /paid/i.test(h));
  let paidTyped = false;
  const rows: SheetRow[] = [];
  const nameLines = new Map<string, number>();
  for (let r = next; r < all.length; r++) {
    const { line, cells } = all[r];
    if (isBlankRow(cells)) {
      if (all.slice(r + 1).some((later) => !isBlankRow(later.cells))) {
        notes.push(
          `Reading stopped at the blank line ${line}. The lines below it are not imported.`,
        );
      }
      break;
    }
    if (paidColumn > 0 && clean(cells[paidColumn])) paidTyped = true;
    const name = clean(cells[0]);
    const rowProblems: string[] = [];
    if (!name) rowProblems.push('This line has picks but no name.');
    else if (name.length > MAX_IMPORT_NAME_LENGTH)
      rowProblems.push(`Keep the name under ${MAX_IMPORT_NAME_LENGTH} characters.`);
    const key = name.toLowerCase();
    if (name && nameLines.has(key)) {
      rowProblems.push(`Same name as line ${nameLines.get(key)}. Give each player their own name.`);
    } else if (name) {
      nameLines.set(key, line);
    }

    const picks: Record<string, Pick> = {};
    for (const col of gameColumns) {
      const typed = clean(cells[col]);
      if (!typed) continue;
      const team = resolveTeam(typed);
      if (!team) {
        const suggestion = suggestTeam(typed);
        rowProblems.push(
          `${headers[col]}: "${typed}" isn't a team name.${suggestion ? ` Did you mean ${suggestion}?` : ''}`,
        );
        continue;
      }
      const game = gameForTeam(team, games);
      if (!game) {
        rowProblems.push(`${headers[col]}: the ${team} don't play this week.`);
        continue;
      }
      const expected = columnGame.get(col);
      if (expected && expected.id !== game.id) {
        rowProblems.push(
          `${headers[col]}: ${team} is in the wrong column. ${headers[col]} is ${gameLabel(expected)}.`,
        );
        continue;
      }
      if (picks[game.id]) {
        rowProblems.push(`Two picks for ${gameLabel(game)}.`);
        continue;
      }
      picks[game.id] = sideOf(team, game);
    }
    if (Object.keys(picks).length === 0 && rowProblems.length === 0) {
      rowProblems.push('No picks on this line.');
    }

    let tiebreakerTotal: number | null = null;
    if (tiebreakerColumn !== null) {
      const typed = clean(cells[tiebreakerColumn]);
      const value = /^\d+$/.test(typed) ? Number(typed) : NaN;
      if (!typed) rowProblems.push('No tiebreaker.');
      else if (!Number.isInteger(value) || value > MAX_TIEBREAKER)
        rowProblems.push(
          `The tiebreaker "${typed}" must be a whole number from 0 to ${MAX_TIEBREAKER}.`,
        );
      else tiebreakerTotal = value;
    }

    rows.push({
      line,
      name,
      picks,
      blankGameIds: games.filter((g) => !picks[g.id]).map((g) => g.id),
      tiebreakerTotal,
      problems: rowProblems,
    });
  }

  if (rows.length === 0 && problems.length === 0) {
    problems.push('No players found under the heading row.');
  }
  if (paidTyped) {
    notes.push('The Paid column is not imported. Mark payments on the Payments screen.');
  }
  return { rows, problems, notes };
}
