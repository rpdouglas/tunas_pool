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

describe('describeActor', () => {
  it('names the scheduler and scripts for what they are', () => {
    expect(describeActor('system:lockWeeks')).toBe('The pool, automatically');
    expect(describeActor('script:backfill-2026')).toBe('A one-off script (backfill-2026)');
    expect(describeActor('abcdef123456', 'abcdef123456')).toBe('You');
    expect(describeActor('abcdef123456')).toBe('Admin abcdef');
  });
});
