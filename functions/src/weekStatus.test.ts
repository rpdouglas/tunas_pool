import { describe, expect, it } from 'vitest';
import { defaultLockAt, parseMatchups } from '../../shared/weeks';
import { planStatusChange, type WeekSnapshot } from './weekStatus';
import { planGuestMove } from './guestMove';

const SUNDAY = '2026-10-11';
const TEAMS = [
  'Jaguars',
  'Rams',
  'Colts',
  'Commanders',
  'Bills',
  'Dolphins',
  'Ravens',
  'Bengals',
  'Browns',
  'Steelers',
  'Texans',
  'Titans',
  'Broncos',
  'Raiders',
  'Cowboys',
  'Giants',
  'Eagles',
  'Bears',
  'Lions',
  'Packers',
  'Vikings',
  'Falcons',
  'Panthers',
  'Saints',
  'Buccaneers',
  'Cardinals',
  '49ers',
  'Seahawks',
  'Chiefs',
  'Chargers',
];
const text = Array.from({ length: 15 }, (_, i) => `${TEAMS[i * 2]} at ${TEAMS[i * 2 + 1]}`).join(
  '\n',
);
const lockAtMs = defaultLockAt(SUNDAY).getTime();
const week = (overrides: Partial<WeekSnapshot> = {}): WeekSnapshot => ({
  status: 'draft',
  lockAtMs,
  games: parseMatchups(text, SUNDAY).games,
  mnfGameId: 'mnf',
  ...overrides,
});
const NOW = lockAtMs - 3 * 24 * 60 * 60 * 1000;

describe('planStatusChange', () => {
  it('opens a ready draft week', () => {
    expect(planStatusChange(week(), 'open', NOW, 0)).toEqual({
      ok: true,
      update: { status: 'open' },
    });
  });

  it("refuses to open a week that isn't ready, and says why", () => {
    const plan = planStatusChange(week({ games: [] }), 'open', NOW, 0);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.message).toContain('The sheet needs 14 Sunday games.');
    expect(planStatusChange(week(), 'open', lockAtMs + 1, 0).ok).toBe(false);
  });

  it('puts an open week back to draft only while nobody has entered', () => {
    expect(planStatusChange(week({ status: 'open' }), 'draft', NOW, 0)).toEqual({
      ok: true,
      update: { status: 'draft' },
    });
    expect(planStatusChange(week({ status: 'open' }), 'draft', NOW, 3).ok).toBe(false);
  });

  it('locks early with the reveal, like the scheduled lock', () => {
    expect(planStatusChange(week({ status: 'open' }), 'locked', NOW, 5)).toEqual({
      ok: true,
      update: { status: 'locked', revealed: true },
    });
  });

  it('rejects any other change', () => {
    expect(planStatusChange(week(), 'locked', NOW, 0).ok).toBe(false);
    expect(planStatusChange(week({ status: 'locked' }), 'open', NOW, 0).ok).toBe(false);
    expect(planStatusChange(week({ status: 'final' }), 'draft', NOW, 0).ok).toBe(false);
  });
});

describe('planGuestMove', () => {
  const guest = { claimedByUid: 'guest1' };

  it('relinks the guest profile when the account has none', () => {
    expect(
      planGuestMove({
        guestUid: 'guest1',
        guestProfile: guest,
        callerUid: 'acct',
        callerProfileIds: [],
      }),
    ).toEqual({
      action: 'relink',
      playerId: 'guest1',
    });
  });

  it('asks for the admin when both logins have a profile', () => {
    expect(
      planGuestMove({
        guestUid: 'guest1',
        guestProfile: guest,
        callerUid: 'acct',
        callerProfileIds: ['acct'],
      }),
    ).toEqual({ action: 'needs_admin', playerId: 'guest1' });
  });

  it('does nothing without a guest profile, or for a profile the guest does not own', () => {
    expect(
      planGuestMove({
        guestUid: 'guest1',
        guestProfile: null,
        callerUid: 'acct',
        callerProfileIds: [],
      }),
    ).toEqual({
      action: 'nothing',
    });
    expect(
      planGuestMove({
        guestUid: 'guest1',
        guestProfile: { claimedByUid: 'other' },
        callerUid: 'acct',
        callerProfileIds: [],
      }),
    ).toEqual({ action: 'nothing' });
    expect(
      planGuestMove({
        guestUid: 'acct',
        guestProfile: guest,
        callerUid: 'acct',
        callerProfileIds: [],
      }),
    ).toEqual({
      action: 'nothing',
    });
  });
});
