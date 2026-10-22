import { checkRoleChange, claimsWithRole, parseRoleChoice, type RoleChangeFacts } from './roles';

describe('claimsWithRole (D-140)', () => {
  it('sets one role and drops the other', () => {
    expect(claimsWithRole({ counter: true }, 'admin')).toEqual({ admin: true });
    expect(claimsWithRole({ admin: true }, 'counter')).toEqual({ counter: true });
    expect(claimsWithRole({ admin: true, counter: true }, 'none')).toEqual({});
    expect(claimsWithRole(undefined, 'counter')).toEqual({ counter: true });
  });

  it("keeps the other apps' claims on the shared project", () => {
    expect(claimsWithRole({ lilypadEditor: true, admin: true }, 'none')).toEqual({
      lilypadEditor: true,
    });
  });
});

describe('parseRoleChoice', () => {
  it('takes the three choices and nothing else', () => {
    expect(parseRoleChoice('admin')).toBe('admin');
    expect(parseRoleChoice('counter')).toBe('counter');
    expect(parseRoleChoice('none')).toBe('none');
    expect(parseRoleChoice('owner')).toBeNull();
    expect(parseRoleChoice(true)).toBeNull();
    expect(parseRoleChoice(undefined)).toBeNull();
  });
});

describe('checkRoleChange', () => {
  const facts: RoleChangeFacts = {
    displayName: 'Devon',
    uid: 'devon-uid',
    actorUid: 'ryan-uid',
    merged: false,
    savedLogin: true,
  };
  const refusal = (f: Partial<RoleChangeFacts>) => {
    const r = checkRoleChange({ ...facts, ...f });
    return r.ok ? null : r.message;
  };

  it('allows a linked player with a saved login', () => {
    expect(checkRoleChange(facts)).toEqual({ ok: true });
  });

  it('refuses a profile with no login, a guest login, a merged profile, and yourself', () => {
    expect(refusal({ uid: null })).toMatch(/isn't linked to a login/);
    expect(refusal({ savedLogin: false })).toMatch(/signed in as a guest/);
    expect(refusal({ merged: true })).toMatch(/merged into another player/);
    expect(refusal({ uid: 'ryan-uid' })).toBe("You can't change your own role.");
  });
});
