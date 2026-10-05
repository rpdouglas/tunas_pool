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
