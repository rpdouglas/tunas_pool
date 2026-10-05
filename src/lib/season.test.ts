import { currentSeason, upcomingSunday } from './season';

describe('season helpers (pool time)', () => {
  it('picks the next Sunday, never the current one', () => {
    expect(upcomingSunday(new Date('2026-10-07T16:00:00Z'))).toBe('2026-10-11'); // Wednesday
    expect(upcomingSunday(new Date('2026-10-11T16:00:00Z'))).toBe('2026-10-18'); // Sunday afternoon
    expect(upcomingSunday(new Date('2026-10-12T02:00:00Z'))).toBe('2026-10-18'); // Sunday 10 PM Toronto, Monday UTC
    expect(upcomingSunday(new Date('2026-10-10T16:00:00Z'))).toBe('2026-10-11'); // Saturday
  });

  it('puts January playoffs in the previous season', () => {
    expect(currentSeason(new Date('2027-01-15T12:00:00Z'))).toBe('2026');
    expect(currentSeason(new Date('2026-10-05T01:00:00Z'))).toBe('2026');
  });
});
