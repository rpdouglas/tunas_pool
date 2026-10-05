import { describe, expect, it } from 'vitest';
import { planSeasonStatus } from './seasons';

describe('planSeasonStatus', () => {
  it('archives a season once nothing is still being played', () => {
    expect(planSeasonStatus({ status: 'active', liveWeeks: 0 }, 'archived')).toEqual({ ok: true });
  });

  it('refuses while a week is open or locked, and says what to do', () => {
    expect(planSeasonStatus({ status: 'active', liveWeeks: 2 }, 'archived')).toEqual({
      ok: false,
      message:
        '2 weeks are still being played. Publish the winner for each, then archive the season.',
    });
    expect(planSeasonStatus({ status: 'active', liveWeeks: 1 }, 'archived')).toMatchObject({
      message: expect.stringContaining('1 week is still'),
    });
  });

  it('reopens an archived season, and refuses a change that changes nothing', () => {
    expect(planSeasonStatus({ status: 'archived', liveWeeks: 0 }, 'active')).toEqual({ ok: true });
    expect(planSeasonStatus({ status: 'archived', liveWeeks: 0 }, 'archived').ok).toBe(false);
    expect(planSeasonStatus({ status: 'active', liveWeeks: 3 }, 'active').ok).toBe(false);
  });
});
