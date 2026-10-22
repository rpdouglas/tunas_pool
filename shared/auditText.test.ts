import { describe, expect, it } from 'vitest';
import { describeActor, describeAudit, type AuditRecord } from './auditText';

const names = (id: string) => ({ rosalie: 'Rosalie M.', dale: 'Dale D.' })[id];
const entry = (overrides: Partial<AuditRecord>): AuditRecord => ({
  actorUid: 'boss',
  action: 'payment.set',
  target: 'seasons/2026/weeks/wk05/entries/rosalie/payment/current',
  year: '2026',
  weekId: 'wk05',
  ...overrides,
});

describe('describeAudit', () => {
  it('says what was done on the board (D-102), by name', () => {
    const hidden = entry({
      action: 'board.hidden',
      target: 'seasons/2026/weeks/wk05/board/m1',
      before: { playerId: 'dale', displayName: 'Dale D.', text: 'x' },
      after: { hidden: true },
    });
    expect(describeAudit(hidden, names).what).toBe('Hid a post by Dale D. on the board');
    const mute = (muted: boolean) =>
      entry({
        action: 'board.mute',
        target: 'seasons/2026/weeks/wk05/boardMutes/dale',
        after: { muted, displayName: 'Dale D.' },
      });
    expect(describeAudit(mute(true), names).what).toBe('Muted Dale D. on the board');
    expect(describeAudit(mute(false), names).what).toBe('Let Dale D. post on the board again');
  });

  it('says who was marked paid, how, and in which week', () => {
    expect(
      describeAudit(
        entry({ after: { paymentStatus: 'paid', paymentMethod: 'cash' } }),
        names,
        'boss',
      ),
    ).toEqual({ what: 'Marked Rosalie M. paid (cash)', where: 'Week 5 · 2026', who: 'You' });
    expect(describeAudit(entry({ after: { paymentStatus: 'unpaid' } }), names).what).toBe(
      'Put Rosalie M. back to unpaid',
    );
  });

  it('tells entering from changing, and a late entry from a normal one', () => {
    const target = 'seasons/2026/weeks/wk05/entries/dale';
    expect(
      describeAudit(entry({ action: 'entry.adminUpsert', target, before: null }), names).what,
    ).toBe('Entered picks for Dale D.');
    expect(
      describeAudit(entry({ action: 'entry.adminUpsert', target, before: { picks: {} } }), names)
        .what,
    ).toBe('Changed the picks for Dale D.');
    expect(
      describeAudit(entry({ action: 'entry.lateOverride', target, before: null }), names).what,
    ).toBe('Added a late entry for Dale D.');
    expect(describeAudit(entry({ action: 'entry.delete', target }), names).what).toBe(
      "Removed Dale D.'s entry",
    );
  });

  it('falls back to the name stored on the entry when the player is no longer on the roster', () => {
    const gone = entry({
      action: 'entry.delete',
      target: 'seasons/2026/weeks/wk05/entries/ghost',
      before: { displayName: 'Old Timer' },
    });
    expect(describeAudit(gone, names).what).toBe("Removed Old Timer's entry");
  });

  it('describes the week actions', () => {
    const week = (action: string, extra: Partial<AuditRecord>) =>
      describeAudit(entry({ action, target: 'seasons/2026/weeks/wk05', ...extra }), names).what;
    expect(week('week.status', { before: { status: 'draft' }, after: { status: 'open' } })).toBe(
      'Opened the week for picks',
    );
    expect(week('week.status', { before: { status: 'open' }, after: { status: 'locked' } })).toBe(
      'Locked the week and revealed the picks',
    );
    expect(week('week.status', { before: null, after: { status: 'locked' } })).toMatch(
      /backfilled/,
    );
    expect(
      week('week.winnerPublished', { after: { winner: { displayNames: ['Dale D.', 'Jen K.'] } } }),
    ).toBe('Published the winner: Dale D. & Jen K.');
    expect(week('week.payout', { after: { payoutSent: true } })).toBe('Marked the payout sent');
    expect(week('week.correction', { after: { winnerChanged: true } })).toBe(
      'Corrected a result, which changed the winner',
    );
    expect(week('week.correction', { before: { weekId: 'wk01' }, after: { weekId: 'wk05' } })).toBe(
      'Renumbered the week (it was wk01)',
    );
  });

  it('describes claims, merges, and seasons', () => {
    expect(
      describeAudit(
        { actorUid: 'boss', action: 'claim.approved', target: 'players/rosalie' },
        names,
      ),
    ).toEqual({ what: 'Linked Rosalie M. to a login', where: '', who: 'Admin boss' });
    expect(
      describeAudit(
        {
          actorUid: 'boss',
          action: 'player.merged',
          target: 'players/dale',
          after: { mergedInto: 'rosalie' },
        },
        names,
      ).what,
    ).toBe('Merged Dale D. into Rosalie M.');
    expect(
      describeAudit(
        {
          actorUid: 'boss',
          action: 'season.status',
          target: 'seasons/2026',
          year: '2026',
          after: { status: 'archived' },
        },
        names,
      ),
    ).toMatchObject({ what: 'Archived the season', where: '2026' });
  });

  it('shows an unknown action as it is stored, rather than hiding it', () => {
    expect(describeAudit(entry({ action: 'something.new' }), names).what).toBe('something.new');
  });
});

describe('a counter in the audit log (D-095)', () => {
  const record: AuditRecord = {
    actorUid: 'devon-uid',
    actorRole: 'counter',
    actorEmail: 'devon@shop.test',
    action: 'payment.set',
    target: 'seasons/2026/weeks/wk05/entries/rosalie/payment/current',
    after: { paymentStatus: 'paid', paymentMethod: 'cash' },
    year: '2026',
    weekId: 'wk05',
  };

  it('puts the action under their name, not under "Admin"', () => {
    expect(describeAudit(record, () => 'Rosalie M.').who).toBe('Counter (devon@shop.test)');
  });

  it('falls back to the start of their uid when there is no email', () => {
    expect(describeActor('devon-uid', undefined, { actorRole: 'counter' })).toBe(
      'Counter (devon-)',
    );
  });

  it('still says "You" to the counter themselves, and the roster actions read plainly', () => {
    expect(describeAudit(record, () => 'Rosalie M.', 'devon-uid').who).toBe('You');
    const added: AuditRecord = {
      actorUid: 'devon-uid',
      actorRole: 'counter',
      action: 'player.saved',
      target: 'players/p1',
      before: null,
      after: { displayName: 'Walt W.', created: true },
    };
    expect(describeAudit(added, () => undefined).what).toBe('Added Walt W. to the roster');
    expect(describeAudit({ ...added, before: { displayName: 'Walt' } }, () => undefined).what).toBe(
      'Fixed the details for Walt W.',
    );
  });
});

describe('describeActor', () => {
  it('names the scheduler and scripts for what they are', () => {
    expect(describeActor('system:lockWeeks')).toBe('The pool, automatically');
    expect(describeActor('script:backfill-2026')).toBe('A one-off script (backfill-2026)');
    expect(describeActor('abcdef123456', 'abcdef123456')).toBe('You');
    expect(describeActor('abcdef123456')).toBe('Admin abcdef');
  });
});

describe('describeAudit: Tunas 649 Bingo', () => {
  const bingo = (overrides: Partial<AuditRecord>): AuditRecord => ({
    actorUid: 'boss',
    action: 'bingo.payment',
    target: 'bingoCycles/2026-11-11/draws/2026-11-18/payments/cA',
    ...overrides,
  });

  it('says where, and payments in words: method, draw, late', () => {
    const paid = describeAudit(
      bingo({
        after: {
          paid: true,
          method: 'cash',
          drawDate: '2026-11-25',
          late: true,
          displayName: 'Rosalie M.',
        },
      }),
      names,
    );
    expect(paid).toMatchObject({
      what: "Marked Rosalie M.'s bingo card paid (cash) for the 2026-11-25 draw, after the cutoff",
      where: 'Bingo · game starting 2026-11-11',
    });
    expect(
      describeAudit(bingo({ after: { paid: false, displayName: 'Dale D.' } }), names).what,
    ).toBe("Took the money off Dale D.'s bingo card");
  });

  it('draws with their numbers, and the correction from and to', () => {
    const target = 'bingoCycles/2026-11-11/draws/2026-11-18';
    expect(
      describeAudit(
        bingo({ action: 'bingo.drawApproved', target, after: { numbers: [4, 5, 7, 33, 34, 35] } }),
        names,
      ).what,
    ).toBe('Approved the bingo draw: 4 5 7 33 34 35');
    expect(
      describeAudit(
        bingo({
          action: 'bingo.drawCorrected',
          target,
          before: { numbers: [1, 2, 3, 4, 5, 7] },
          after: { numbers: [1, 2, 3, 4, 5, 6] },
        }),
        names,
      ).what,
    ).toBe('Corrected the bingo draw from: 1 2 3 4 5 7 to: 1 2 3 4 5 6');
  });

  it('members by name, from the membership path', () => {
    expect(
      describeAudit(
        bingo({ action: 'bingo.memberJoined', target: 'bingoMembers/dale', after: {} }),
        names,
      ).what,
    ).toBe('Dale D. joined bingo with the invite code');
    expect(
      describeAudit(
        bingo({ action: 'bingo.memberAdded', target: 'bingoMembers/rosalie', after: {} }),
        names,
      ).what,
    ).toBe('Added Rosalie M. to bingo on paper, age checked in person');
  });

  it('games: opened, won, capped, carried, and removed', () => {
    const cycle = (after: unknown) =>
      describeAudit(
        bingo({ action: 'bingo.cycle', target: 'bingoCycles/2026-11-25', after }),
        names,
      ).what;
    expect(cycle({ status: 'open', number: 2 })).toBe('Opened bingo game 2');
    expect(
      cycle({ status: 'won', winners: [{ displayName: 'Alice A.' }, { displayName: 'Bob B.' }] }),
    ).toBe('Bingo was won by Alice A. & Bob B.');
    expect(cycle({ status: 'capped', winners: [{ displayName: 'Rosalie M.' }] })).toBe(
      'Bingo reached its last week; the closest won: Rosalie M.',
    );
    expect(cycle({ status: 'capped', winners: [] })).toBe(
      'Bingo reached its last week with nobody paid; the pot carries over',
    );
    expect(cycle(null)).toBe('Removed a bingo game that a correction took the win from');
  });
});

describe('a staff role from the roster (D-140)', () => {
  it('says what role the player was given', () => {
    const base: AuditRecord = {
      actorUid: 'ryan-uid',
      action: 'player.role',
      target: 'players/devon',
      before: { displayName: 'Devon', role: 'none' },
      after: { displayName: 'Devon', role: 'counter' },
    };
    const what = (role: string) =>
      describeAudit({ ...base, after: { displayName: 'Devon', role } }, () => undefined).what;
    expect(what('counter')).toBe('Gave Devon the counter role');
    expect(what('admin')).toBe('Made Devon an admin');
    expect(what('none')).toBe("Took Devon's staff role away");
  });
});
