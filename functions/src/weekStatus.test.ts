import { describe, expect, it } from 'vitest';
import { defaultLockAt, parseMatchups } from '../../shared/weeks';
import { planReopen, planStatusChange, type ReopenSnapshot, type WeekSnapshot } from './weekStatus';
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
    if (!plan.ok) expect(plan.message).toContain('The sheet needs at least one Sunday game.');
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

describe('planReopen', () => {
  const HOUR = 60 * 60 * 1000;
  // Locked at Saturday 11:59 PM; it's Sunday morning and the first game is Sunday 1:00 PM.
  const sundayMorning = lockAtMs + 8 * HOUR;
  const noon = lockAtMs + 12 * HOUR + 60_000;
  const locked = (overrides: Partial<ReopenSnapshot> = {}): ReopenSnapshot => ({
    ...week({ status: 'locked' }),
    backfilled: false,
    resultCount: 0,
    mnfTotal: null,
    hasWinner: false,
    ...overrides,
  });

  it('reopens a locked week with a new lock before the first kickoff, and hides the picks', () => {
    expect(planReopen(locked(), noon, sundayMorning)).toEqual({
      ok: true,
      update: { status: 'open', revealed: false, lockAtMs: noon },
    });
  });

  it('refuses a lock time in the past or at or after the first kickoff', () => {
    const past = planReopen(locked(), sundayMorning - 1, sundayMorning);
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.message).toContain('The lock time has already passed.');
    const late = planReopen(locked(), lockAtMs + 14 * HOUR, sundayMorning);
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.message).toContain('before the first game kicks off');
    expect(planReopen(locked(), Number.NaN, sundayMorning)).toMatchObject({
      ok: false,
      code: 'invalid-argument',
    });
    expect(planReopen(locked(), '12:00', sundayMorning)).toMatchObject({ ok: false });
  });

  it('only reopens a locked week with no results, and never a backfilled one', () => {
    for (const status of ['draft', 'open', 'final'] as const) {
      expect(planReopen(locked({ status }), noon, sundayMorning).ok).toBe(false);
    }
    expect(planReopen(locked({ backfilled: true }), noon, sundayMorning).ok).toBe(false);
    expect(planReopen(locked({ resultCount: 1 }), noon, sundayMorning).ok).toBe(false);
    expect(planReopen(locked({ mnfTotal: 44 }), noon, sundayMorning).ok).toBe(false);
    expect(planReopen(locked({ hasWinner: true }), noon, sundayMorning).ok).toBe(false);
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
