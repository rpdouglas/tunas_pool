/**
 * Pool time helpers. Everything the pool shows or schedules is in America/Toronto (CLAUDE.md §5),
 * whatever the device or server clock is set to. Dates are plain 'YYYY-MM-DD' strings.
 */
export const POOL_TIME_ZONE = 'America/Toronto';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDate(isoDate: string): [number, number, number] {
  const m = DATE_RE.exec(isoDate);
  if (!m) throw new Error(`Expected YYYY-MM-DD, got "${isoDate}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Milliseconds the zone is ahead of UTC at the given instant (Toronto: -4h or -5h). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant when the wall clock in the pool's zone reads isoDate hour:minute. */
export function zonedTimeToUtc(
  isoDate: string,
  hour: number,
  minute: number,
  timeZone = POOL_TIME_ZONE,
): Date {
  const [y, mo, d] = parseIsoDate(isoDate);
  const guess = Date.UTC(y, mo - 1, d, hour, minute);
  const first = guess - zoneOffsetMs(new Date(guess), timeZone);
  const second = guess - zoneOffsetMs(new Date(first), timeZone);
  return new Date(second);
}

/** The pool-zone calendar date and wall time of an instant. */
export function toZonedParts(instant: Date, timeZone = POOL_TIME_ZONE) {
  const shifted = new Date(instant.getTime() + zoneOffsetMs(instant, timeZone));
  const isoDate = shifted.toISOString().slice(0, 10);
  return {
    isoDate,
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = parseIsoDate(isoDate);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(isoDate: string): number {
  const [y, m, d] = parseIsoDate(isoDate);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "1:00 PM" */
export function formatClock(hour: number, minute: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/** "Sunday, Oct 12, 1:00 PM" in the pool's zone (US-style AM/PM, matching the sheet). */
export function formatPoolDateTime(
  instant: Date,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: POOL_TIME_ZONE,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...options,
  }).format(instant);
}

/** "Sunday, Oct 11" for a plain date. */
export function formatPoolDate(isoDate: string, options: Intl.DateTimeFormatOptions = {}): string {
  const [y, m, d] = parseIsoDate(isoDate);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Whole days from one plain date to another. */
export function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const [a, b] = [fromIsoDate, toIsoDate].map((iso) => {
    const [y, m, d] = parseIsoDate(iso);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}
