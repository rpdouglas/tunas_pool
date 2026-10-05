import { describe, expect, it } from 'vitest';
import {
  claimGate,
  mergeConflicts,
  parseClaimRequest,
  parseDecisionNote,
  rankClaimCandidates,
  suggestedCandidate,
  type ClaimablePlayer,
} from './claims';

describe('parseClaimRequest', () => {
  it('tidies the name and normalizes a phone from either side of the border', () => {
    expect(
      parseClaimRequest({ claimedName: '  Rosalie   M. ', claimedPhone: '(315) 555-0199' }),
    ).toEqual({ ok: true, value: { claimedName: 'Rosalie M.', claimedPhone: '+13155550199' } });
  });

  it('takes a name alone, and treats null like a blank (the browser sends omitted fields as null)', () => {
    expect(parseClaimRequest({ claimedName: 'Bernie T.', claimedPhone: null })).toEqual({
      ok: true,
      value: { claimedName: 'Bernie T.', claimedPhone: null },
    });
    expect(parseClaimRequest({ claimedName: 'Bernie T.', claimedPhone: '  ' })).toMatchObject({
      ok: true,
      value: { claimedPhone: null },
    });
  });

  it('refuses a missing or huge name, a bad phone, and nothing at all', () => {
    expect(parseClaimRequest({ claimedName: 'R' }).ok).toBe(false);
    expect(parseClaimRequest({ claimedName: 'x'.repeat(61) }).ok).toBe(false);
    expect(parseClaimRequest({ claimedName: 'Rosalie M.', claimedPhone: '555' }).ok).toBe(false);
    expect(parseClaimRequest(null).ok).toBe(false);
    expect(parseClaimRequest({ claimedName: 42 }).ok).toBe(false);
  });
});

describe('claimGate', () => {
  const NOW = 10 * 24 * 60 * 60 * 1000;
  const HOUR = 60 * 60 * 1000;
  const base = { isGuest: false, linkedToRoster: false, claims: [], nowMs: NOW };

  it('lets a saved account with no claims ask', () => {
    expect(claimGate(base)).toEqual({ ok: true });
  });

  it('asks a guest to save their account first', () => {
    expect(claimGate({ ...base, isGuest: true })).toMatchObject({
      ok: false,
      code: 'needs_account',
    });
  });

  it('stops a login that is already linked, or already waiting', () => {
    expect(claimGate({ ...base, linkedToRoster: true })).toMatchObject({ code: 'already_linked' });
    expect(
      claimGate({ ...base, claims: [{ status: 'pending', createdAtMs: NOW - 3 * 24 * HOUR }] }),
    ).toMatchObject({ code: 'already_pending' });
  });

  it('allows three requests in a day and stops the fourth; old ones do not count', () => {
    const rejected = (hoursAgo: number) => ({
      status: 'rejected',
      createdAtMs: NOW - hoursAgo * HOUR,
    });
    expect(claimGate({ ...base, claims: [rejected(1), rejected(2)] })).toEqual({ ok: true });
    expect(claimGate({ ...base, claims: [rejected(1), rejected(2), rejected(23)] })).toMatchObject({
      code: 'too_many',
    });
    expect(claimGate({ ...base, claims: [rejected(1), rejected(2), rejected(25)] })).toEqual({
      ok: true,
    });
  });
});

describe('rankClaimCandidates', () => {
  const player = (
    playerId: string,
    displayName: string,
    overrides: Partial<ClaimablePlayer> = {},
  ): ClaimablePlayer => ({
    playerId,
    displayName,
    phone: null,
    linked: false,
    active: true,
    ...overrides,
  });

  const PLAYERS = [
    player('r1', 'Rosalie M.', { phone: '+16135550144' }),
    player('r2', 'Rose Martin'),
    player('r3', 'Rosalie M'),
    player('b1', 'Bernie T.'),
    player('mine', 'Rosalie M.'),
  ];

  it('puts the same phone first, then the same name, then a similar name', () => {
    const found = rankClaimCandidates(
      { claimedName: 'Rosalie M.', claimedPhone: '+16135550144' },
      PLAYERS,
      ['mine'],
    );
    expect(found.map((c) => c.playerId)).toEqual(['r1', 'r3']);
    expect(found[0].reasons).toEqual(['phone', 'name']);
    expect(found[1].reasons).toEqual(['name']);
  });

  it("never offers the claimant's own profile", () => {
    const found = rankClaimCandidates({ claimedName: 'Rosalie M.', claimedPhone: null }, PLAYERS, [
      'mine',
    ]);
    expect(found.map((c) => c.playerId)).not.toContain('mine');
  });

  it('finds nobody for a stranger, and at most five people', () => {
    expect(rankClaimCandidates({ claimedName: 'Wanda Q.', claimedPhone: null }, PLAYERS)).toEqual(
      [],
    );
    const many = Array.from({ length: 8 }, (_, i) => player(`d${i}`, 'Dale D.'));
    expect(rankClaimCandidates({ claimedName: 'Dale D.', claimedPhone: null }, many)).toHaveLength(
      5,
    );
  });

  it('suggests the best match that is not already linked', () => {
    const linkedFirst = [
      player('r1', 'Rosalie M.', { phone: '+16135550144', linked: true }),
      player('r3', 'Rosalie M'),
    ];
    const found = rankClaimCandidates(
      { claimedName: 'Rosalie M.', claimedPhone: '+16135550144' },
      linkedFirst,
    );
    expect(found[0]).toMatchObject({ playerId: 'r1', linked: true });
    expect(suggestedCandidate(found)).toBe('r3');
    expect(suggestedCandidate([found[0]])).toBeNull();
  });
});

describe('mergeConflicts', () => {
  it('lists the weeks both profiles entered', () => {
    expect(mergeConflicts(['2026/wk03', '2026/wk01'], ['2026/wk02', '2026/wk03'])).toEqual([
      '2026/wk03',
    ]);
    expect(mergeConflicts(['2026/wk01'], ['2026/wk02'])).toEqual([]);
  });
});

describe('parseDecisionNote', () => {
  it('is optional, tidied, and capped', () => {
    expect(parseDecisionNote(null)).toEqual({ ok: true, value: null });
    expect(parseDecisionNote('  Call the   shop ')).toEqual({ ok: true, value: 'Call the shop' });
    expect(parseDecisionNote('x'.repeat(201)).ok).toBe(false);
  });
});
