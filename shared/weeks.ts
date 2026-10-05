/**
 * Week setup rules shared by the admin screens and the `adminSetWeekStatus` callable, so the
 * preview and the server agree on what makes a week ready to open (docs/DATA_MODEL.md §3.5, §6).
 *
 * Matchups are pasted one game per line, in paper-sheet order:
 *   Sun 9:30 AM Jaguars at Rams (London)
 *   Colts at Commanders
 *   Mon 8:15 PM Chiefs at Jaguars
 * A line with no day and time is Sunday 1:00 PM, except the last line, which is Monday 8:15 PM.
 */
import type { GameSlot, WeekStatus } from './types';
import { resolveTeam, suggestTeam } from './teams';
import { addDays, formatClock, toZonedParts, weekdayOf, zonedTimeToUtc } from './time';

export const SUNDAY_GAMES = 14;
export const GAMES_PER_WEEK = SUNDAY_GAMES + 1;
export const MNF_GAME_ID = 'mnf';
export const DEFAULT_ENTRY_FEE_CENTS = 2000;

const DEFAULT_SUNDAY = { hour: 13, minute: 0 };
const DEFAULT_MNF = { hour: 20, minute: 15 };
/** Default lock: Saturday 11:59 PM, the night before the Sunday games (DECISIONS.md D-011). */
export const DEFAULT_LOCK = { daysBeforeSunday: 1, hour: 23, minute: 59 };

/** A game with its kickoff as epoch milliseconds, free of any Firestore Timestamp class. */
export interface GameDraft {
  id: string;
  order: number;
  away: string;
  home: string;
  venueNote?: string;
  kickoffMs: number;
  slot: GameSlot;
}

export interface LineProblem {
  line: number; // 1-based line number in the pasted text
  message: string;
}

export function weekIdFor(weekNumber: number): string {
  return `wk${String(weekNumber).padStart(2, '0')}`;
}

export function gameIdFor(order: number, slot: GameSlot): string {
  return slot === 'mnf' ? MNF_GAME_ID : `g${String(order).padStart(2, '0')}`;
}

/** The season a date belongs to: January and February games are part of the previous year's season. */
export function seasonFor(isoDate: string): string {
  const [year, month] = isoDate.split('-').map(Number);
  return String(month <= 2 ? year - 1 : year);
}

export function defaultLockAt(sundayIsoDate: string): Date {
  return zonedTimeToUtc(
    addDays(sundayIsoDate, -DEFAULT_LOCK.daysBeforeSunday),
    DEFAULT_LOCK.hour,
    DEFAULT_LOCK.minute,
  );
}

const DAY_RE =
  /^(sun(?:day)?|mon(?:day)?|sat(?:urday)?|thu(?:rs?(?:day)?)?|fri(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?)\b\.?\s*/i;
const TIME_RE = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?\s*/i;
const MATCHUP_RE = /^(.+?)\s+(?:at|@)\s+(.+?)(?:\s*[([]\s*([^)\]]+?)\s*[)\]])?$/i;

/** Parse the pasted matchups. Problems are reported per line in plain words. */
export function parseMatchups(
  text: string,
  sundayIsoDate: string,
): { games: GameDraft[]; problems: LineProblem[] } {
  const problems: LineProblem[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((raw, index) => ({ raw: raw.trim(), line: index + 1 }))
    .filter((l) => l.raw !== '' && !l.raw.startsWith('#'));

  if (weekdayOf(sundayIsoDate) !== 0) {
    problems.push({ line: 0, message: 'The week date must be a Sunday.' });
    return { games: [], problems };
  }

  const games: GameDraft[] = [];
  let sundayOrder = 0;

  lines.forEach(({ raw, line }, index) => {
    const isLast = index === lines.length - 1;
    let rest = raw.replace(/^\d+[.)]\s*/, ''); // allow "1. Colts at Commanders"

    let day: 'sun' | 'mon' | null = null;
    const dayMatch = DAY_RE.exec(rest);
    if (dayMatch) {
      const word = dayMatch[1].toLowerCase();
      if (word.startsWith('sun')) day = 'sun';
      else if (word.startsWith('mon')) day = 'mon';
      else {
        problems.push({ line, message: 'Only Sunday and Monday games go on the sheet.' });
        return;
      }
      rest = rest.slice(dayMatch[0].length);
    }

    let clock: { hour: number; minute: number } | null = null;
    const timeMatch = TIME_RE.exec(rest);
    if (timeMatch) {
      const hour12 = Number(timeMatch[1]);
      const minute = Number(timeMatch[2] ?? '0');
      if (hour12 < 1 || hour12 > 12 || minute > 59) {
        problems.push({
          line,
          message: `"${timeMatch[0].trim()}" isn't a time. Use something like 1:00 PM.`,
        });
        return;
      }
      const pm = timeMatch[3].toLowerCase() === 'p';
      clock = { hour: (hour12 % 12) + (pm ? 12 : 0), minute };
      rest = rest.slice(timeMatch[0].length);
    }
    rest = rest.replace(/^[|\-–:]\s*/, '');

    const matchup = MATCHUP_RE.exec(rest);
    if (!matchup) {
      problems.push({
        line,
        message: 'Write the game as "Away at Home", for example "Colts at Commanders".',
      });
      return;
    }
    const away = resolveTeam(matchup[1]);
    const home = resolveTeam(matchup[2]);
    for (const [typed, team] of [
      [matchup[1], away],
      [matchup[2], home],
    ] as const) {
      if (!team) {
        const suggestion = suggestTeam(typed);
        problems.push({
          line,
          message: suggestion
            ? `"${typed.trim()}" isn't a team name. Did you mean ${suggestion}?`
            : `"${typed.trim()}" isn't a team name.`,
        });
      }
    }
    if (!away || !home) return;

    const resolvedDay = day ?? (isLast ? 'mon' : 'sun');
    const slot: GameSlot = resolvedDay === 'mon' ? 'mnf' : 'sunday';
    const time = clock ?? (slot === 'mnf' ? DEFAULT_MNF : DEFAULT_SUNDAY);
    const date = slot === 'mnf' ? addDays(sundayIsoDate, 1) : sundayIsoDate;
    const order = slot === 'mnf' ? GAMES_PER_WEEK : ++sundayOrder;

    games.push({
      id: gameIdFor(order, slot),
      order,
      away,
      home,
      ...(matchup[3] ? { venueNote: matchup[3] } : {}),
      kickoffMs: zonedTimeToUtc(date, time.hour, time.minute).getTime(),
      slot,
    });
  });

  return { games, problems };
}

/** "Sun 1:00 PM" / "Mon 8:15 PM", in pool time. */
export function kickoffLabel(game: Pick<GameDraft, 'kickoffMs'>): string {
  const { hour, minute, weekday } = toZonedParts(new Date(game.kickoffMs));
  return `${weekday === 1 ? 'Mon' : 'Sun'} ${formatClock(hour, minute)}`;
}

/** Turn saved games back into pasteable text, for editing or cloning a week. */
export function gamesToText(games: GameDraft[]): string {
  return [...games]
    .sort((a, b) => a.order - b.order)
    .map((g) => {
      const { hour, minute, weekday } = toZonedParts(new Date(g.kickoffMs));
      const day = weekday === 1 ? 'Mon' : 'Sun';
      const note = g.venueNote ? ` (${g.venueNote})` : '';
      return `${day} ${formatClock(hour, minute)} ${g.away} at ${g.home}${note}`;
    })
    .join('\n');
}

/** The Sunday a set of games belongs to, from the earliest Sunday kickoff. */
export function sundayOf(games: GameDraft[]): string | null {
  const sunday = games
    .filter((g) => g.slot === 'sunday')
    .sort((a, b) => a.kickoffMs - b.kickoffMs)[0];
  return sunday ? toZonedParts(new Date(sunday.kickoffMs)).isoDate : null;
}

/**
 * Everything that stops a week from opening, in plain words. Empty means ready.
 * `nowMs` is passed in so the server's clock decides, never the client's (CLAUDE.md §4.4).
 */
export function weekProblems(
  week: { games: GameDraft[]; lockAtMs: number; mnfGameId: string },
  nowMs: number,
): string[] {
  const problems: string[] = [];
  const sunday = week.games.filter((g) => g.slot === 'sunday');
  const mnf = week.games.filter((g) => g.slot === 'mnf');

  if (sunday.length !== SUNDAY_GAMES) {
    problems.push(`The sheet needs ${SUNDAY_GAMES} Sunday games. This week has ${sunday.length}.`);
  }
  if (mnf.length !== 1) {
    problems.push(`The sheet needs exactly one Monday night game. This week has ${mnf.length}.`);
  } else if (week.mnfGameId !== mnf[0].id) {
    problems.push('The Monday night game must be the tiebreaker game.');
  }

  const seen = new Set<string>();
  for (const g of week.games) {
    if (g.away === g.home) problems.push(`${g.away} can't play themselves.`);
    for (const team of [g.away, g.home]) {
      if (seen.has(team)) problems.push(`${team} are listed twice.`);
      seen.add(team);
    }
  }

  if (week.games.length > 0) {
    const firstKickoff = Math.min(...week.games.map((g) => g.kickoffMs));
    if (week.lockAtMs >= firstKickoff)
      problems.push('Picks must lock before the first game kicks off.');
  }
  if (week.lockAtMs <= nowMs) problems.push('The lock time has already passed.');

  return [...new Set(problems)];
}

/** Status changes the admin may make. Results and the winner move a week to final, not this. */
export const ADMIN_STATUS_CHANGES: Record<WeekStatus, WeekStatus[]> = {
  draft: ['open'],
  open: ['draft', 'locked'],
  locked: [],
  final: [],
};

export function canChangeStatus(from: WeekStatus, to: WeekStatus): boolean {
  return ADMIN_STATUS_CHANGES[from].includes(to);
}
