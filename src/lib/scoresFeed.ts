/**
 * The week's scores from ESPN's public scoreboard feed (D-085, D-098), read from the browser of
 * whoever is looking: the commissioner's Results screen and every player's week page. The feed is
 * unofficial and may change or go away, so callers treat a failure as "no scores", never as an error
 * that hides the page. Nothing is sent but the two dates.
 */
import { readEspnScores, type FeedScore } from '@shared/schedule';
import { addDays } from '@shared/time';
import { sundayOf, type GameDraft } from '@shared/weeks';

export const SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

/** Scores for the week's Sunday and the Monday after. */
export async function fetchWeekScores(games: GameDraft[]): Promise<FeedScore[]> {
  const sunday = sundayOf(games);
  if (!sunday) throw new Error('This week has no Sunday game to look up.');
  const days = await Promise.all(
    [sunday, addDays(sunday, 1)].map(async (isoDate) => {
      // The feed takes one day at a time, as YYYYMMDD in Eastern time.
      const response = await fetch(`${SCOREBOARD_URL}?dates=${isoDate.replaceAll('-', '')}`);
      if (!response.ok) throw new Error(`Scores feed answered ${response.status}`);
      return readEspnScores(await response.json());
    }),
  );
  return days.flat();
}
