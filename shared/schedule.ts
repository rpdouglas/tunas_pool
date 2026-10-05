/**
 * Turn a public schedule feed into the pasted-matchups text the week editor already understands
 * (docs/DECISIONS.md D-051). The feed only suggests: the admin reviews the text and saves it, and
 * `parseMatchups` and `weekProblems` still decide what is valid. Team names only, no league marks
 * (CLAUDE.md §4.9).
 */
import { resolveTeam } from './teams';
import { addDays, formatClock, toZonedParts } from './time';

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
    const completed = asRecord(asRecord(competition.status)?.type)?.completed === true;
    scores.push({
      away: sides.away.name,
      home: sides.home.name,
      final: completed && Number.isFinite(sides.away.points) && Number.isFinite(sides.home.points),
      awayPoints: sides.away.points,
      homePoints: sides.home.points,
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
