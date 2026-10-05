import {
  addDays,
  countdownText,
  formatClock,
  toZonedParts,
  weekdayOf,
  zonedTimeToUtc,
} from './time';

describe('pool time (America/Toronto)', () => {
  it('converts wall-clock time in Toronto to UTC, in daylight time and standard time', () => {
    expect(zonedTimeToUtc('2026-10-11', 13, 0).toISOString()).toBe('2026-10-11T17:00:00.000Z'); // EDT
    expect(zonedTimeToUtc('2026-12-06', 13, 0).toISOString()).toBe('2026-12-06T18:00:00.000Z'); // EST
  });

  it('handles the night clocks fall back (Nov 1, 2026)', () => {
    expect(zonedTimeToUtc('2026-10-31', 23, 59).toISOString()).toBe('2026-11-01T03:59:00.000Z');
    expect(zonedTimeToUtc('2026-11-01', 13, 0).toISOString()).toBe('2026-11-01T18:00:00.000Z');
  });

  it('reads an instant back as a Toronto date and time', () => {
    expect(toZonedParts(new Date('2026-10-13T00:15:00Z'))).toEqual({
      isoDate: '2026-10-12',
      hour: 20,
      minute: 15,
      weekday: 1,
    });
  });

  it('does date arithmetic on plain dates', () => {
    expect(addDays('2026-10-11', -1)).toBe('2026-10-10');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekdayOf('2026-10-11')).toBe(0);
    expect(formatClock(0, 5)).toBe('12:05 AM');
    expect(formatClock(20, 15)).toBe('8:15 PM');
  });
});

describe('countdownText', () => {
  const now = 1_000_000_000_000;
  const at = (ms: number) => countdownText(now + ms, now);
  it('counts down in days, hours, and minutes', () => {
    expect(at((26 * 60 + 12) * 60_000)).toBe('1d 02h 12m');
    expect(at((3 * 60 + 5) * 60_000)).toBe('3h 05m');
    expect(at(12 * 60_000 + 30_000)).toBe('12m');
    expect(at(30_000)).toBe('Under a minute');
    expect(at(0)).toBeNull();
  });
});
