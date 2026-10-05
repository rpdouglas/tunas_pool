/**
 * Fetches the week's games from ESPN's public scoreboard feed, to pre-fill the matchups box
 * (docs/DECISIONS.md D-051). The feed is unofficial and may change or go away, so every failure
 * ends in "paste the games instead". Called from the admin's browser only; nothing is sent but
 * the two dates.
 */
import { useMutation } from '@tanstack/react-query';
import { readEspnScoreboard, scheduleToText, type ScheduleText } from '@shared/schedule';
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
