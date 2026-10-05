/**
 * Fetches the week's games from ESPN's public scoreboard feed, to pre-fill the matchups box
 * (docs/DECISIONS.md D-051). The feed is unofficial and may change or go away, so every failure
 * ends in "paste the games instead". Called from the admin's browser only; nothing is sent but
 * the two dates.
 */
import { useMutation } from '@tanstack/react-query';
import {
  readEspnScoreboard,
  readEspnScores,
  scheduleToText,
  suggestResults,
  type ResultSuggestion,
  type ScheduleText,
} from '@shared/schedule';
import { sundayOf, type GameDraft } from '@shared/weeks';
import { addDays } from '@shared/time';

const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

async function fetchDay(isoDate: string) {
  // The feed takes one day at a time (a date range is refused), as YYYYMMDD in Eastern time.
  const response = await fetch(`${SCOREBOARD_URL}?dates=${isoDate.replaceAll('-', '')}`);
  if (!response.ok) throw new Error(`Schedule feed answered ${response.status}`);
  return readEspnScoreboard(await response.json());
}

export async function fetchWeekSchedule(sundayIsoDate: string): Promise<ScheduleText> {
  const days = await Promise.all([fetchDay(sundayIsoDate), fetchDay(addDays(sundayIsoDate, 1))]);
  return scheduleToText(days.flat(), sundayIsoDate);
}

export function useWeekSchedule() {
  return useMutation({ mutationFn: fetchWeekSchedule });
}

/** Final scores for a week's Sunday and Monday, as suggested results for the commissioner to check. */
export async function fetchResultSuggestion(games: GameDraft[]): Promise<ResultSuggestion> {
  const sunday = sundayOf(games);
  if (!sunday) throw new Error('This week has no Sunday game to look up.');
  const days = await Promise.all(
    [sunday, addDays(sunday, 1)].map(async (isoDate) => {
      const response = await fetch(`${SCOREBOARD_URL}?dates=${isoDate.replaceAll('-', '')}`);
      if (!response.ok) throw new Error(`Scores feed answered ${response.status}`);
      return readEspnScores(await response.json());
    }),
  );
  return suggestResults(games, days.flat());
}

export function useResultSuggestion() {
  return useMutation({ mutationFn: fetchResultSuggestion });
}
