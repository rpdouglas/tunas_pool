import { toZonedParts } from './time';
import {
  canChangeStatus,
  defaultLockAt,
  gamesToText,
  parseMatchups,
  seasonFor,
  sundayOf,
  weekIdFor,
  weekProblems,
  type GameDraft,
} from './weeks';

const SUNDAY = '2026-10-11';
const FULL_WEEK = `Sun 9:30 AM Jaguars at Rams (London)
Colts at Commanders
Bills at Dolphins
Ravens at Bengals
Browns at Steelers
Texans at Titans
Broncos at Raiders
Cowboys at Giants
Eagles at Bears
Lions at Packers
Vikings at Falcons
Panthers at Saints
Buccaneers at Cardinals
Sun 4:25 PM 49ers at Seahawks
Mon 8:15 PM Chiefs at Chargers`;

const parsed = () => parseMatchups(FULL_WEEK, SUNDAY);
const lock = defaultLockAt(SUNDAY).getTime();
const before = (iso: string) => new Date(iso).getTime();

describe('parseMatchups', () => {
  it('parses a full sheet in paper order with ids, slots, and kickoffs', () => {
    const { games, problems } = parsed();
    expect(problems).toEqual([]);
    expect(games).toHaveLength(15);
    expect(games[0]).toMatchObject({
      id: 'g01',
      order: 1,
      away: 'Jaguars',
      home: 'Rams',
      venueNote: 'London',
      slot: 'sunday',
    });
    expect(games[1]).toMatchObject({ id: 'g02', away: 'Colts', home: 'Commanders' });
    expect(games[14]).toMatchObject({ id: 'mnf', order: 15, slot: 'mnf' });
    expect(toZonedParts(new Date(games[0].kickoffMs))).toMatchObject({
      isoDate: SUNDAY,
      hour: 9,
      minute: 30,
    });
    expect(toZonedParts(new Date(games[1].kickoffMs))).toMatchObject({ hour: 13, minute: 0 }); // default
    expect(toZonedParts(new Date(games[14].kickoffMs))).toMatchObject({
      isoDate: '2026-10-12',
      hour: 20,
      minute: 15,
    });
  });

  it('treats an undated last line as Monday night, 8:15 PM', () => {
    const { games } = parseMatchups('Colts at Commanders\nChiefs at Chargers', SUNDAY);
    expect(games[1]).toMatchObject({ id: 'mnf', slot: 'mnf' });
    expect(toZonedParts(new Date(games[1].kickoffMs))).toMatchObject({
      isoDate: '2026-10-12',
      hour: 20,
      minute: 15,
    });
  });

  it('accepts "@", numbering, full team names, and skips blank and # lines', () => {
    const { games, problems } = parseMatchups(
      '# week 6\n\n1. Indianapolis Colts @ Washington Commanders\n2) Chiefs at Chargers',
      SUNDAY,
    );
    expect(problems).toEqual([]);
    expect(games.map((g) => `${g.away}-${g.home}`)).toEqual([
      'Colts-Commanders',
      'Chiefs-Chargers',
    ]);
  });

  it('explains bad lines in plain words, with line numbers', () => {
    const { problems } = parseMatchups(
      'Colts vs Commanders\nSat 1:00 PM Bills at Jets\nComanders at Bears\nChiefs at Chargers',
      SUNDAY,
    );
    expect(problems).toEqual([
      { line: 1, message: 'Write the game as "Away at Home", for example "Colts at Commanders".' },
      { line: 2, message: 'Only Sunday and Monday games go on the sheet.' },
      { line: 3, message: '"Comanders" isn\'t a team name. Did you mean Commanders?' },
    ]);
  });

  it('requires the week date to be a Sunday', () => {
    expect(parseMatchups(FULL_WEEK, '2026-10-10').problems[0].message).toBe(
      'The week date must be a Sunday.',
    );
  });

  it('round-trips through gamesToText', () => {
    const { games } = parsed();
    expect(parseMatchups(gamesToText(games), SUNDAY).games).toEqual(games);
    expect(sundayOf(games)).toBe(SUNDAY);
  });
});

describe('weekProblems', () => {
  const ready = () => ({ games: parsed().games, lockAtMs: lock, mnfGameId: 'mnf' });

  it('is empty for a full, valid week before the lock', () => {
    expect(weekProblems(ready(), before('2026-10-06T12:00:00Z'))).toEqual([]);
  });

  it('allows a short week: fewer than 14 Sunday games is fine (byes, Thursday games)', () => {
    const week = { ...ready(), games: ready().games.slice(1) };
    expect(week.games.filter((g) => g.slot === 'sunday')).toHaveLength(13);
    expect(weekProblems(week, before('2026-10-06T12:00:00Z'))).toEqual([]);
  });

  it('needs 1 to 14 Sunday games and one Monday night game', () => {
    const mnfOnly = { ...ready(), games: ready().games.slice(14) };
    expect(weekProblems(mnfOnly, 0)).toContain('The sheet needs at least one Sunday game.');
    const extra: GameDraft = {
      ...ready().games[0],
      id: 'g15',
      order: 15,
      away: 'Panthers',
      home: 'Chiefs',
    };
    const tooMany = { ...ready(), games: [...ready().games, extra] };
    expect(weekProblems(tooMany, 0)).toContain(
      'The sheet has room for 14 Sunday games. This week has 15.',
    );
    const noMnf = { ...ready(), games: ready().games.slice(0, 14) };
    expect(weekProblems(noMnf, 0)).toContain(
      'The sheet needs exactly one Monday night game. This week has 0.',
    );
  });

  it('catches a team listed twice', () => {
    const games: GameDraft[] = ready().games.map((g) =>
      g.id === 'g02' ? { ...g, home: 'Rams' } : g,
    );
    expect(weekProblems({ ...ready(), games }, 0)).toContain('Rams are listed twice.');
  });

  it('needs the lock before the first kickoff, and in the future (by the server clock)', () => {
    const late = { ...ready(), lockAtMs: before('2026-10-11T14:00:00Z') }; // after the 9:30 AM London game
    expect(weekProblems(late, 0)).toContain('Picks must lock before the first game kicks off.');
    expect(weekProblems(ready(), lock + 1)).toContain('The lock time has already passed.');
  });
});

describe('helpers', () => {
  it('locks Saturday 11:59 PM Toronto by default', () => {
    expect(toZonedParts(defaultLockAt(SUNDAY))).toEqual({
      isoDate: '2026-10-10',
      hour: 23,
      minute: 59,
      weekday: 6,
    });
  });

  it('names weeks and seasons', () => {
    expect(weekIdFor(4)).toBe('wk04');
    expect(seasonFor('2026-10-11')).toBe('2026');
    expect(seasonFor('2027-01-10')).toBe('2026');
  });

  it('allows only the admin status changes in the plan', () => {
    expect(canChangeStatus('draft', 'open')).toBe(true);
    expect(canChangeStatus('open', 'draft')).toBe(true);
    expect(canChangeStatus('open', 'locked')).toBe(true);
    expect(canChangeStatus('draft', 'locked')).toBe(false);
    expect(canChangeStatus('locked', 'open')).toBe(false);
    expect(canChangeStatus('final', 'draft')).toBe(false);
  });
});
