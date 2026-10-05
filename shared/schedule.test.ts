import { readEspnScores, suggestResults, readEspnScoreboard, scheduleToText } from './schedule';
import { defaultLockAt, parseMatchups, weekProblems } from './weeks';

const SUNDAY = '2026-10-11';

/** One event in the shape of the ESPN scoreboard feed, trimmed to the fields that are read. */
const event = (
  date: string,
  away: string,
  home: string,
  venue?: { city: string; neutralSite: boolean },
) => ({
  date,
  competitions: [
    {
      neutralSite: venue?.neutralSite ?? false,
      venue: { address: { city: venue?.city ?? 'Somewhere' } },
      competitors: [
        { homeAway: 'home', team: { shortDisplayName: home } },
        { homeAway: 'away', team: { shortDisplayName: away } },
      ],
    },
  ],
});

// 2026 week 5, as the feed returned it: a Thursday game, 13 Sunday games, and Monday night.
const WEEK_5 = {
  events: [
    event('2026-10-13T00:15Z', 'Bills', 'Rams'),
    event('2026-10-09T00:15Z', 'Buccaneers', 'Cowboys'),
    event('2026-10-11T13:30Z', 'Eagles', 'Jaguars', { city: 'London', neutralSite: true }),
    event('2026-10-11T17:00Z', 'Bears', 'Packers', { city: 'Green Bay', neutralSite: false }),
    event('2026-10-11T17:00Z', 'Texans', 'Titans'),
    event('2026-10-11T17:00Z', 'Bengals', 'Dolphins'),
    event('2026-10-11T17:00Z', 'Raiders', 'Patriots'),
    event('2026-10-11T17:00Z', 'Vikings', 'Saints'),
    event('2026-10-11T17:00Z', 'Browns', 'Jets'),
    event('2026-10-11T17:00Z', 'Colts', 'Steelers'),
    event('2026-10-11T17:00Z', 'Giants', 'Commanders'),
    event('2026-10-11T20:05Z', 'Broncos', 'Chargers'),
    event('2026-10-11T20:25Z', 'Lions', 'Cardinals'),
    event('2026-10-11T20:25Z', '49ers', 'Seahawks'),
    event('2026-10-12T00:20Z', 'Ravens', 'Falcons'),
  ],
};

describe('readEspnScoreboard', () => {
  it('reads kickoff, teams, and the city of a neutral-site game', () => {
    const games = readEspnScoreboard(WEEK_5);
    expect(games).toHaveLength(15);
    expect(games[2]).toEqual({
      kickoffMs: Date.parse('2026-10-11T13:30Z'),
      away: 'Eagles',
      home: 'Jaguars',
      venueNote: 'London',
    });
    expect(games[3]).not.toHaveProperty('venueNote');
  });

  it('returns nothing for a response that is not a scoreboard', () => {
    expect(readEspnScoreboard(null)).toEqual([]);
    expect(readEspnScoreboard({ code: 400, message: 'Failed to get events endpoint.' })).toEqual(
      [],
    );
    expect(readEspnScoreboard({ events: [{ date: 'soon' }, 7, { competitions: [{}] }] })).toEqual(
      [],
    );
  });
});

describe('scheduleToText', () => {
  const result = scheduleToText(readEspnScoreboard(WEEK_5), SUNDAY);

  it('keeps Sunday and Monday games in kickoff order, in pool time, with Monday last', () => {
    const lines = result.text.split('\n');
    expect(result).toMatchObject({ sundayGames: 13, mondayGames: 1 });
    expect(lines).toHaveLength(14);
    expect(lines[0]).toBe('Sun 9:30 AM Eagles at Jaguars (London)');
    expect(lines[1]).toBe('Sun 1:00 PM Bears at Packers');
    expect(lines[12]).toBe('Sun 8:20 PM Ravens at Falcons'); // 00:20 UTC Monday is Sunday night
    expect(lines[13]).toBe('Mon 8:15 PM Bills at Rams');
    expect(result.text).not.toContain('Cowboys'); // Thursday game
  });

  it('produces a week the editor accepts as ready', () => {
    const { games, problems } = parseMatchups(result.text, SUNDAY);
    expect(problems).toEqual([]);
    const week = { games, lockAtMs: defaultLockAt(SUNDAY).getTime(), mnfGameId: 'mnf' };
    expect(weekProblems(week, Date.parse('2026-10-06T12:00:00Z'))).toEqual([]);
  });

  it('leaves out a team the pool does not know', () => {
    const games = readEspnScoreboard({ events: [event('2026-10-11T17:00Z', 'AFC', 'NFC')] });
    expect(scheduleToText(games, SUNDAY)).toEqual({ text: '', sundayGames: 0, mondayGames: 0 });
  });
});

describe('results from the feed', () => {
  const event = (
    away: string,
    awayScore: string,
    home: string,
    homeScore: string,
    completed = true,
  ) => ({
    competitions: [
      {
        status: { type: { completed } },
        competitors: [
          { homeAway: 'home', score: homeScore, team: { shortDisplayName: home } },
          { homeAway: 'away', score: awayScore, team: { shortDisplayName: away } },
        ],
      },
    ],
  });
  const payload = {
    events: [
      event('Colts', '30', 'Commanders', '13'),
      event('Jets', '12', 'Bears', '23'),
      event('Lions', '20', 'Packers', '20'),
      event('Falcons', '0', 'Saints', '0', false),
      { competitions: 'nonsense' },
      event('Not A Team', '1', 'Bears', '2'),
    ],
  };
  const games = [
    { id: 'g01', away: 'Colts', home: 'Commanders', slot: 'sunday' },
    { id: 'g02', away: 'Jets', home: 'Bears', slot: 'sunday' },
    { id: 'g03', away: 'Lions', home: 'Packers', slot: 'sunday' },
    { id: 'g04', away: 'Bills', home: 'Dolphins', slot: 'sunday' },
    { id: 'mnf', away: 'Falcons', home: 'Saints', slot: 'mnf' },
  ];

  it('reads final scores and skips anything that is not a game between known teams', () => {
    const scores = readEspnScores(payload);
    expect(scores.map((s) => `${s.away} at ${s.home}`)).toEqual([
      'Colts at Commanders',
      'Jets at Bears',
      'Lions at Packers',
      'Falcons at Saints',
    ]);
    expect(scores[0]).toMatchObject({ final: true, awayPoints: 30, homePoints: 13 });
    expect(scores[3].final).toBe(false);
    expect(readEspnScores(null)).toEqual([]);
  });

  it('suggests a winner or a tie for each final game, and lists the rest', () => {
    const suggestion = suggestResults(games, readEspnScores(payload));
    expect(suggestion.results).toEqual({ g01: 'away', g02: 'home', g03: 'tie' });
    expect(suggestion.mnfTotal).toBeNull();
    expect(suggestion.notFinal).toEqual(['Bills at Dolphins', 'Falcons at Saints']);
  });

  it('adds up Monday night once it is final', () => {
    const done = { events: [event('Falcons', '27', 'Saints', '23')] };
    expect(suggestResults(games, readEspnScores(done))).toMatchObject({
      results: { mnf: 'away' },
      mnfTotal: 50,
    });
  });

  it('does not match a game with home and away the other way round', () => {
    const swapped = { events: [event('Commanders', '13', 'Colts', '30')] };
    expect(suggestResults(games, readEspnScores(swapped)).results).toEqual({});
  });
});
