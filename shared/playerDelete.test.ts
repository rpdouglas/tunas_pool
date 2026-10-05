import { checkPlayerDelete, describeWeeks, type PlayerFacts } from './playerDelete';

const base: PlayerFacts = {
  displayName: 'Rosalie M.',
  origin: 'admin',
  claimed: false,
  merged: false,
  weeks: [],
  pendingClaims: 0,
};

const message = (facts: Partial<PlayerFacts>) => {
  const check = checkPlayerDelete({ ...base, ...facts });
  return check.ok ? null : check;
};

describe('checkPlayerDelete', () => {
  it('allows a player who has played nothing, has no login, and has no request waiting', () => {
    expect(checkPlayerDelete(base)).toEqual({ ok: true });
  });

  it('refuses anyone with history, and says to use Inactive or a merge instead', () => {
    const check = message({ weeks: [{ year: '2026', weekId: 'wk03' }] });
    expect(check?.code).toBe('played');
    expect(check?.message).toContain('one week (week 3 of 2026)');
    expect(check?.message).toContain('Inactive');
    expect(check?.message).toContain('merge');
  });

  it('lists a short history in full and a long one with a count', () => {
    const weeks = (ids: string[]) => ids.map((weekId) => ({ year: '2026', weekId }));
    expect(describeWeeks(weeks(['wk01', 'wk02']))).toBe('week 1 of 2026 and week 2 of 2026');
    expect(describeWeeks(weeks(['wk01', 'wk02', 'wk03']))).toBe(
      'week 1 of 2026, week 2 of 2026 and week 3 of 2026',
    );
    expect(describeWeeks(weeks(['wk10', 'wk02', 'wk03', 'wk04', 'wk05']))).toBe(
      'week 2 of 2026, week 3 of 2026, week 4 of 2026 and 2 more',
    );
  });

  it('puts history before the login, because it is the bigger reason', () => {
    const check = message({ claimed: true, weeks: [{ year: '2026', weekId: 'wk01' }] });
    expect(check?.code).toBe('played');
  });

  it('refuses a linked player, with advice that matches how they were linked', () => {
    expect(message({ claimed: true, origin: 'admin' })?.message).toContain(
      'Unlink the login first',
    );
    const self = message({ claimed: true, origin: 'self' });
    expect(self?.code).toBe('linked');
    expect(self?.message).toContain('their own login');
  });

  it('refuses while a request to link a login is waiting on this player', () => {
    const check = message({ pendingClaims: 1 });
    expect(check?.code).toBe('pending_claim');
    expect(check?.message).toContain('Claims');
  });

  it('says a merged profile needs no deleting', () => {
    expect(message({ merged: true })?.code).toBe('merged');
  });
});
