import { describe, expect, it } from 'vitest';
import { blankGames, entryWindow, parseAdminEntry, parseReason } from './paperEntry';

const WEEK = { year: '2026', weekId: 'wk01', gameIds: ['g01', 'g02', 'mnf'] };
const sheet = {
  source: 'paper',
  picks: { g01: 'home', g02: 'away', mnf: 'home' },
  tiebreakerTotal: 44,
};

describe('parseAdminEntry', () => {
  it('reads a full paper sheet', () => {
    expect(parseAdminEntry(sheet, WEEK)).toEqual({
      ok: true,
      value: { ...sheet, paperPhotoPath: null, markPaid: null },
    });
  });

  it('treats null like a missing field, because the browser sends omitted fields as null', () => {
    const parsed = parseAdminEntry({ ...sheet, paperPhotoPath: null, markPaid: null }, WEEK);
    expect(parsed).toMatchObject({ ok: true, value: { paperPhotoPath: null, markPaid: null } });
  });

  it('keeps a blank on the sheet as a blank', () => {
    const parsed = parseAdminEntry({ ...sheet, picks: { g01: 'home' } }, WEEK);
    expect(parsed).toMatchObject({ ok: true, value: { picks: { g01: 'home' } } });
  });

  it('refuses a sheet with no picks at all, or with nothing sent', () => {
    expect(parseAdminEntry({ ...sheet, picks: {} }, WEEK).ok).toBe(false);
    expect(parseAdminEntry(null, WEEK).ok).toBe(false);
    expect(parseAdminEntry({ ...sheet, picks: ['home'] }, WEEK).ok).toBe(false);
  });

  it("refuses a pick for a game that isn't on the sheet, or that isn't a team", () => {
    expect(parseAdminEntry({ ...sheet, picks: { g09: 'home' } }, WEEK).ok).toBe(false);
    expect(parseAdminEntry({ ...sheet, picks: { g01: 'tie' } }, WEEK).ok).toBe(false);
  });

  it('wants a whole-number tiebreaker from 0 to 200', () => {
    for (const bad of [-1, 201, 44.5, '44', null, undefined]) {
      expect(parseAdminEntry({ ...sheet, tiebreakerTotal: bad }, WEEK).ok).toBe(false);
    }
    expect(parseAdminEntry({ ...sheet, tiebreakerTotal: 0 }, WEEK).ok).toBe(true);
  });

  it('wants a known source', () => {
    expect(parseAdminEntry({ ...sheet, source: 'fax' }, WEEK).ok).toBe(false);
    expect(parseAdminEntry({ ...sheet, source: undefined }, WEEK).ok).toBe(false);
    expect(parseAdminEntry({ ...sheet, source: 'text' }, WEEK).ok).toBe(true);
  });

  it("only takes a photo from this week's folder", () => {
    const good = 'paperSheets/2026/wk01/p1-1700000000000.jpg';
    expect(parseAdminEntry({ ...sheet, paperPhotoPath: good }, WEEK)).toMatchObject({
      ok: true,
      value: { paperPhotoPath: good },
    });
    for (const bad of [
      'paperSheets/2026/wk02/p1.jpg',
      'paperSheets/2026/wk01/../../secrets.jpg',
      'paperSheets/2026/wk01/',
      'other/p1.jpg',
      42,
    ]) {
      expect(parseAdminEntry({ ...sheet, paperPhotoPath: bad }, WEEK).ok).toBe(false);
    }
  });

  it('takes cash or e-Transfer when the money comes with the sheet', () => {
    expect(parseAdminEntry({ ...sheet, markPaid: 'cash' }, WEEK)).toMatchObject({
      ok: true,
      value: { markPaid: 'cash' },
    });
    expect(parseAdminEntry({ ...sheet, markPaid: 'cheque' }, WEEK).ok).toBe(false);
  });
});

describe('parseReason', () => {
  it('trims and tidies the reason', () => {
    expect(parseReason('  Sheet was handed   in Friday ', 'the late entry')).toEqual({
      ok: true,
      value: 'Sheet was handed in Friday',
    });
  });

  it('refuses a missing, tiny, or huge reason', () => {
    expect(parseReason(null, 'the late entry')).toEqual({
      ok: false,
      message: 'Type a short reason for the late entry.',
    });
    expect(parseReason('ok', 'the late entry').ok).toBe(false);
    expect(parseReason('x'.repeat(301), 'the late entry').ok).toBe(false);
  });
});

describe('blankGames', () => {
  it('lists the games with no pick, in sheet order', () => {
    const games = [{ id: 'g01' }, { id: 'g02' }, { id: 'mnf' }];
    expect(blankGames(games, { g02: 'away' })).toEqual([{ id: 'g01' }, { id: 'mnf' }]);
    expect(blankGames(games, sheet.picks)).toEqual([]);
  });
});

describe('entryWindow', () => {
  const NOW = 1_000_000;
  it('is a normal entry while the week is open and the lock time is ahead', () => {
    expect(entryWindow({ status: 'open', lockAtMs: NOW + 1 }, NOW)).toEqual({ mode: 'open' });
  });

  it('is a late entry once the lock time passes, even before the scheduler locks the week', () => {
    expect(entryWindow({ status: 'open', lockAtMs: NOW }, NOW)).toEqual({ mode: 'late' });
    expect(entryWindow({ status: 'locked', lockAtMs: NOW - 5 }, NOW)).toEqual({ mode: 'late' });
  });

  it('is closed for a draft and once the winner is published', () => {
    expect(entryWindow({ status: 'draft', lockAtMs: NOW + 1 }, NOW).mode).toBe('closed');
    expect(entryWindow({ status: 'final', lockAtMs: NOW - 5 }, NOW).mode).toBe('closed');
  });
});
