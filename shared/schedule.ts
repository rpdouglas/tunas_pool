/**
 * Turn a public schedule feed into the pasted-matchups text the week editor already understands
 * (docs/DECISIONS.md D-051). The feed only suggests: the admin reviews the text and saves it, and
 * `parseMatchups` and `weekProblems` still decide what is valid. Team names only, no league marks
 * (CLAUDE.md §4.9).
 */
import { resolveTeam } from './teams';
import { addDays, formatClock, toZonedParts } from './time';
import type { GameResult } from './types';
import { kickoffLabel } from './weeks';

export interface ScheduleGame {
  kickoffMs: number;
  away: string;
  home: string;
  /** City of a neutral-site game, for example "London". */
  venueNote?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * Read the games out of an ESPN scoreboard response. The feed is unofficial, so nothing about its
 * shape is trusted: anything that doesn't look like a game is left out.
 */
export function readEspnScoreboard(payload: unknown): ScheduleGame[] {
  const events = asRecord(payload)?.events;
  if (!Array.isArray(events)) return [];

  const games: ScheduleGame[] = [];
  for (const rawEvent of events) {
    const event = asRecord(rawEvent);
    const competitions = event?.competitions;
    const competition = Array.isArray(competitions) ? asRecord(competitions[0]) : null;
    const competitors = competition?.competitors;
    if (!event || !competition || !Array.isArray(competitors)) continue;

    const kickoffMs = typeof event.date === 'string' ? Date.parse(event.date) : NaN;
    const sides: Record<string, string> = {};
    for (const rawSide of competitors) {
      const side = asRecord(rawSide);
      const team = asRecord(side?.team);
      const name = team?.shortDisplayName ?? team?.displayName;
      if (typeof side?.homeAway === 'string' && typeof name === 'string') {
        sides[side.homeAway] = name;
      }
    }
    if (Number.isNaN(kickoffMs) || !sides.away || !sides.home) continue;

    const city = asRecord(asRecord(competition.venue)?.address)?.city;
    games.push({
      kickoffMs,
      away: sides.away,
      home: sides.home,
      ...(competition.neutralSite === true && typeof city === 'string' ? { venueNote: city } : {}),
    });
  }
  return games;
}

export interface ScheduleText {
  text: string;
  sundayGames: number;
  mondayGames: number;
}

/**
 * The Sunday and Monday games of the week as matchup lines, in kickoff order with Monday last.
 * Games on other days and teams the pool doesn't know are left out.
 */
export function scheduleToText(games: ScheduleGame[], sundayIsoDate: string): ScheduleText {
  const monday = addDays(sundayIsoDate, 1);
  const lines: string[] = [];
  let sundayGames = 0;
  let mondayGames = 0;

  for (const game of [...games].sort((a, b) => a.kickoffMs - b.kickoffMs)) {
    const { isoDate, hour, minute } = toZonedParts(new Date(game.kickoffMs));
    if (isoDate !== sundayIsoDate && isoDate !== monday) continue;
    const away = resolveTeam(game.away);
    const home = resolveTeam(game.home);
    if (!away || !home) continue;

    const isMonday = isoDate === monday;
    if (isMonday) mondayGames += 1;
    else sundayGames += 1;
    const note = game.venueNote ? ` (${game.venueNote})` : '';
    lines.push(
      `${isMonday ? 'Mon' : 'Sun'} ${formatClock(hour, minute)} ${away} at ${home}${note}`,
    );
  }

  return { text: lines.join('\n'), sundayGames, mondayGames };
}

export interface FeedScore {
  away: string;
  home: string;
  /** The game is over and both scores are numbers. */
  final: boolean;
  awayPoints: number;
  homePoints: number;
  /** Not started, being played, or over (D-104). Over includes postponed and cancelled. */
  state: 'pre' | 'in' | 'post';
  /** The quarter, 5 or more for overtime; null before kickoff or when the feed leaves it out. */
  period: number | null;
  /** Game clock as the feed writes it, like "7:21". */
  clock: string | null;
  /** The feed's status name, like "STATUS_HALFTIME" or "STATUS_POSTPONED". */
  statusName: string | null;
}

/** Final scores out of an ESPN scoreboard response, by the pool's own team names. Trusts nothing. */
export function readEspnScores(payload: unknown): FeedScore[] {
  const events = asRecord(payload)?.events;
  if (!Array.isArray(events)) return [];
  const scores: FeedScore[] = [];
  for (const rawEvent of events) {
    const competitions = asRecord(rawEvent)?.competitions;
    const competition = Array.isArray(competitions) ? asRecord(competitions[0]) : null;
    const competitors = competition?.competitors;
    if (!competition || !Array.isArray(competitors)) continue;
    const sides: Record<string, { name: string | null; points: number }> = {};
    for (const rawSide of competitors) {
      const side = asRecord(rawSide);
      const team = asRecord(side?.team);
      const name = team?.shortDisplayName ?? team?.displayName;
      if (typeof side?.homeAway !== 'string') continue;
      sides[side.homeAway] = {
        name: typeof name === 'string' ? resolveTeam(name) : null,
        points: Number(side.score),
      };
    }
    if (!sides.away?.name || !sides.home?.name) continue;
    const status = asRecord(competition.status);
    const type = asRecord(status?.type);
    const completed = type?.completed === true;
    const state = type?.state === 'in' || type?.state === 'post' ? type.state : 'pre';
    scores.push({
      away: sides.away.name,
      home: sides.home.name,
      final: completed && Number.isFinite(sides.away.points) && Number.isFinite(sides.home.points),
      awayPoints: sides.away.points,
      homePoints: sides.home.points,
      // An older feed without `state` still says when a game is completed.
      state: completed ? 'post' : state,
      period: typeof status?.period === 'number' && status.period > 0 ? status.period : null,
      clock: typeof status?.displayClock === 'string' ? status.displayClock : null,
      statusName: typeof type?.name === 'string' ? type.name : null,
    });
  }
  return scores;
}

export interface ResultSuggestion {
  /** A result for every game on the sheet that the feed says is final. */
  results: Record<string, 'home' | 'away' | 'tie'>;
  /** Combined points of the Monday night game, once it is final. */
  mnfTotal: number | null;
  /** Games on the sheet with no final score in the feed, as "Away at Home". */
  notFinal: string[];
}

/**
 * Suggested results for a week's sheet from the feed's final scores (D-085). Only a suggestion:
 * the commissioner reviews it and saves, and what they enter by hand always wins.
 */
export function suggestResults(
  games: { id: string; away: string; home: string; slot: string }[],
  scores: FeedScore[],
): ResultSuggestion {
  const suggestion: ResultSuggestion = { results: {}, mnfTotal: null, notFinal: [] };
  for (const game of games) {
    const score = scores.find((s) => s.away === game.away && s.home === game.home);
    if (!score?.final) {
      suggestion.notFinal.push(`${game.away} at ${game.home}`);
      continue;
    }
    suggestion.results[game.id] =
      score.homePoints === score.awayPoints
        ? 'tie'
        : score.homePoints > score.awayPoints
          ? 'home'
          : 'away';
    if (game.slot === 'mnf') suggestion.mnfTotal = score.homePoints + score.awayPoints;
  }
  return suggestion;
}

/** Where one game stands on the By game view (D-104). */
export type GameStatus =
  | { kind: 'upcoming'; label: string }
  | { kind: 'live'; label: string; awayPoints: number; homePoints: number }
  | { kind: 'final'; label: string; awayPoints: number; homePoints: number }
  | { kind: 'off'; label: string };

const quarter = (period: number) => (period > 4 ? 'OT' : `Q${period}`);

/**
 * Each game's status in plain words, by game ID: its kickoff before it starts ("Sun 1:00 PM"), the
 * quarter and clock while it is played ("Q3 · 7:21", "Halftime", "End of Q1"), and "Final" or
 * "Final (OT)" once it is over. A postponed or cancelled game says so. A game the feed doesn't
 * have shows its kickoff.
 */
export function gameStatuses(
  games: { id: string; away: string; home: string; kickoffMs: number }[],
  scores: FeedScore[],
): Record<string, GameStatus> {
  const out: Record<string, GameStatus> = {};
  for (const game of games) {
    const score = scores.find((s) => s.away === game.away && s.home === game.home);
    const points = score && { awayPoints: score.awayPoints, homePoints: score.homePoints };
    const hasPoints =
      points && Number.isFinite(points.awayPoints) && Number.isFinite(points.homePoints);
    if (score?.final && points) {
      out[game.id] = {
        kind: 'final',
        label: score.period && score.period > 4 ? 'Final (OT)' : 'Final',
        ...points,
      };
    } else if (score?.state === 'post') {
      out[game.id] = {
        kind: 'off',
        label: score.statusName === 'STATUS_CANCELED' ? 'Cancelled' : 'Postponed',
      };
    } else if (score?.state === 'in' && points && hasPoints) {
      const label =
        score.statusName === 'STATUS_HALFTIME'
          ? 'Halftime'
          : score.statusName === 'STATUS_DELAYED'
            ? 'Delayed'
            : score.statusName === 'STATUS_END_PERIOD' && score.period
              ? `End of ${quarter(score.period)}`
              : score.period
                ? [quarter(score.period), score.clock].filter(Boolean).join(' · ')
                : 'In progress';
      out[game.id] = { kind: 'live', label, ...points };
    } else {
      out[game.id] = { kind: 'upcoming', label: kickoffLabel(game) };
    }
  }
  return out;
}

/** True while any game on the sheet is being played: the week page then refreshes every minute. */
export function anyGameLive(statuses: Record<string, GameStatus>): boolean {
  return Object.values(statuses).some((s) => s.kind === 'live');
}

/**
 * The week's results for the player's week page (D-098): what the commissioner saved, plus the
 * feed's final scores for games not saved yet. Those are unofficial and listed as such. A saved
 * result always wins, even if the feed disagrees.
 */
export function withUnofficialResults(
  games: { id: string; away: string; home: string; slot: string }[],
  official: Record<string, GameResult>,
  scores: FeedScore[],
): { results: Record<string, GameResult>; unofficial: string[] } {
  const suggested = suggestResults(games, scores).results;
  const unofficial = games.map((g) => g.id).filter((id) => !official[id] && suggested[id]);
  const results: Record<string, GameResult> = { ...official };
  for (const id of unofficial) results[id] = suggested[id];
  return { results, unofficial };
}
