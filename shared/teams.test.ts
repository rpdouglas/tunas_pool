import { resolveTeam, suggestTeam } from './teams';

describe('team names', () => {
  it('resolves nicknames, full names, and common short forms', () => {
    expect(resolveTeam('colts')).toBe('Colts');
    expect(resolveTeam('Kansas City Chiefs')).toBe('Chiefs');
    expect(resolveTeam('NY Giants')).toBe('Giants');
    expect(resolveTeam('Bucs')).toBe('Buccaneers');
    expect(resolveTeam('San Francisco 49ers')).toBe('49ers');
  });

  it('rejects things that are not teams, and suggests close matches', () => {
    expect(resolveTeam('Comanders')).toBeNull();
    expect(suggestTeam('Comanders')).toBe('Commanders');
    expect(suggestTeam('Xyzzy')).toBeNull();
  });
});
