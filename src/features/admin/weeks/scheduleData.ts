/**
 * Fetches the week's games from ESPN's public scoreboard feed, to pre-fill the matchups box
 * (docs/DECISIONS.md D-051). The feed is unofficial and may change or go away, so every failure
 * ends in "paste the games instead". Called from the admin's browser only; nothing is sent but
 * the two dates.
 */
import { useMutation } from '@tanstack/react-query';
import {
  readEspnScoreboard,
  scheduleToText,
  suggestResults,
  type ResultSuggestion,
  type ScheduleText,
} from '@shared/schedule';
import type { GameDraft } from '@shared/weeks';
import { addDays } from '@shared/time';
import { SCOREBOARD_URL, fetchWeekScores } from '../../../lib/scoresFeed';

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
  return suggestResults(games, await fetchWeekScores(games));
}

export function useResultSuggestion() {
  return useMutation({ mutationFn: fetchResultSuggestion });
}
