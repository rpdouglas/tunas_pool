import { describe, expect, it } from 'vitest';
import { parseCsv, readPicksSheet, type ImportGame } from './picksImport';

const GAMES: ImportGame[] = [
  { id: 'g01', order: 1, away: 'Texans', home: 'Jaguars' },
  { id: 'g02', order: 2, away: 'Bears', home: 'Falcons' },
  { id: 'g03', order: 3, away: 'Ravens', home: 'Browns' },
  { id: 'mnf', order: 15, away: 'Commanders', home: '49ers' },
];

// The commissioner's layout: a heading row, a matchup row, players, a blank line, then totals.
const SHEET = [
  'Participant,G1,G2,G3,MNF,TB Pts,Record,Paid?',
  'Matchup,Texans at Jaguars (London),Bears at Falcons,Ravens at Browns,Commanders at 49ers,Total,W-L,Paid / Down',
  'Pat Sample,Jaguars,Falcons,Ravens,49ers,49,0-0,',
  'Lou Example,Texans,Bears,Browns,Commanders,45,0-0,',
  ',,,,,,,',
  'Week 5 Winner,Somebody — 12-2,,,,,,',
  'Entry Fee,$20,,,,,,',
].join('\r\n');

describe('parseCsv', () => {
  it('reads quoted cells, doubled quotes, and line breaks inside quotes', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\n"two\nlines",x')).toEqual([
      { line: 1, cells: ['a', 'b, c', 'say "hi"'] },
      { line: 2, cells: ['two\nlines', 'x'] },
    ]);
  });

  it('ignores a byte-order mark and handles Windows line endings', () => {
    expect(parseCsv('﻿a,b\r\nc,d\r\n')).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 2, cells: ['c', 'd'] },
    ]);
  });
});

describe('readPicksSheet', () => {
  it("reads the commissioner's sheet and stops at the blank line", () => {
    const sheet = readPicksSheet(SHEET, GAMES);
    expect(sheet.problems).toEqual([]);
    expect(sheet.rows).toEqual([
      {
        line: 3,
        name: 'Pat Sample',
        picks: { g01: 'home', g02: 'home', g03: 'away', mnf: 'home' },
        blankGameIds: [],
        tiebreakerTotal: 49,
        problems: [],
      },
      {
        line: 4,
        name: 'Lou Example',
        picks: { g01: 'away', g02: 'away', g03: 'home', mnf: 'away' },
        blankGameIds: [],
        tiebreakerTotal: 45,
        problems: [],
      },
    ]);
    expect(sheet.notes).toEqual([
      'Reading stopped at the blank line 5. The lines below it are not imported.',
    ]);
  });

  it('works without a matchup row, finding each game by team', () => {
    const text = 'Name,G1,G2,G3,MNF,TB\nPat,Jags,Bears,Cleveland Browns,Niners,40';
    const sheet = readPicksSheet(text, GAMES);
    expect(sheet.problems).toEqual([]);
    expect(sheet.rows[0].picks).toEqual({ g01: 'home', g02: 'away', g03: 'home', mnf: 'home' });
  });

  it('keeps a blank pick as a blank', () => {
    const sheet = readPicksSheet('Name,G1,G2,G3,MNF,TB\nPat,Jaguars,,Ravens,49ers,40', GAMES);
    expect(sheet.rows[0].problems).toEqual([]);
    expect(sheet.rows[0].blankGameIds).toEqual(['g02']);
  });

  it('says plainly what is wrong with a row', () => {
    const text = [
      'Name,G1,G2,G3,MNF,TB',
      'Matchup,Texans at Jaguars,Bears at Falcons,Ravens at Browns,Commanders at 49ers,Total',
      'Pat,Jagaurs,Lions,Bears,49ers,',
      'Lou,Jaguars,Bears,Ravens,49ers,250',
      'Pat,Jaguars,Bears,Ravens,49ers,30',
      ',Jaguars,Bears,Ravens,49ers,30',
    ].join('\n');
    const [typo, tiebreaker, sameName, noName] = readPicksSheet(text, GAMES).rows;
    expect(typo.problems).toEqual([
      'G1: "Jagaurs" isn\'t a team name. Did you mean Jaguars?',
      "G2: the Lions don't play this week.",
      'G3: Bears is in the wrong column. G3 is Ravens at Browns.',
      'No tiebreaker.',
    ]);
    expect(tiebreaker.problems).toEqual([
      'The tiebreaker "250" must be a whole number from 0 to 200.',
    ]);
    expect(sameName.problems).toEqual(['Same name as line 3. Give each player their own name.']);
    expect(noName.problems).toEqual(['This line has picks but no name.']);
  });

  it('refuses the whole file when the matchups are not this week', () => {
    const text = [
      'Participant,G1,MNF,TB Pts',
      'Matchup,Lions at Bears,Commanders at 49ers,Total',
      'Pat,Lions,49ers,40',
    ].join('\n');
    expect(readPicksSheet(text, GAMES).problems).toEqual([
      'Column G1 says "Lions at Bears", which isn\'t one of this week\'s games. Check the week is the right one.',
    ]);
  });

  it('notes games on the week that the spreadsheet leaves out', () => {
    const text = [
      'Participant,G1,G2,MNF,TB Pts',
      'Matchup,Texans at Jaguars,Bears at Falcons,Commanders at 49ers,Total',
      'Pat,Jaguars,Bears,49ers,40',
    ].join('\n');
    expect(readPicksSheet(text, GAMES).notes).toEqual([
      'Not on the spreadsheet: Ravens at Browns. Those picks are left blank.',
    ]);
  });

  it('needs a heading row, game columns, and a tiebreaker column', () => {
    expect(readPicksSheet('Pat,Jaguars,40', GAMES).problems).toEqual([
      "Couldn't find the heading row. The first column should be headed Participant or Name.",
    ]);
    expect(readPicksSheet('Name,Team\nPat,Jaguars', GAMES).problems).toEqual([
      'No game columns found. Head them G1, G2, and so on, and MNF.',
      'No tiebreaker column found. Head it TB Pts or Tiebreaker.',
    ]);
  });

  it('mentions the Paid column only when something is typed in it', () => {
    expect(readPicksSheet(SHEET, GAMES).notes).not.toContain(
      'The Paid column is not imported. Mark payments on the Payments screen.',
    );
    const paid = SHEET.replace('49,0-0,', '49,0-0,Paid');
    expect(readPicksSheet(paid, GAMES).notes).toContain(
      'The Paid column is not imported. Mark payments on the Payments screen.',
    );
  });
});
