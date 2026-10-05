import { useSearchParams } from 'react-router-dom';
import { currentSeason } from '../../lib/season';
import type { WeekView } from '../../lib/weekModel';
import { useSeasonWeeks } from './weeks/weekData';

/**
 * Which week an admin screen is showing. The season comes from `?season=` (the production test run
 * uses 2026-test, D-044) or today's date. The week comes from `?week=`, else the latest week that
 * is not a draft: the one the commissioner is running right now.
 */
export function useAdminWeek() {
  const [params, setParams] = useSearchParams();
  const year = params.get('season') ?? currentSeason();
  const weeks = useSeasonWeeks(year);
  const visible = (weeks.data ?? []).filter((w) => w.status !== 'draft');
  const requested = params.get('week');
  const week: WeekView | null =
    (requested ? visible.find((w) => w.id === requested) : null) ??
    [...visible].sort((a, b) => b.weekNumber - a.weekNumber)[0] ??
    null;

  return {
    year,
    week,
    weeks: visible,
    isPending: weeks.isPending,
    isError: weeks.isError,
    /** Link target that keeps the season and picks a week. */
    search: (weekId: string) =>
      `?${new URLSearchParams({ ...(params.get('season') ? { season: year } : {}), week: weekId })}`,
    select: (weekId: string) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('week', weekId);
        return next;
      }),
  };
}
