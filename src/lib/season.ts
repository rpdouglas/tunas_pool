import { toZonedParts } from '@shared/time';
import { seasonFor } from '@shared/weeks';

/** The season the admin is working in, from today's date in pool time. */
export function currentSeason(now = new Date()): string {
  return seasonFor(toZonedParts(now).isoDate);
}

/** The next Sunday after today, in pool time. On a Sunday, that week's games are already underway. */
export function upcomingSunday(now = new Date()): string {
  const { isoDate, weekday } = toZonedParts(now);
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + (7 - weekday))).toISOString().slice(0, 10);
}
