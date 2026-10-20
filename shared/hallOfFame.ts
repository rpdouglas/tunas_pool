/**
 * The Hall of Fame (D-108): all-time records across every real season, worked out from the season
 * standings (DATA_MODEL §3.8), so it needs nothing written of its own. Pure, so the numbers can be
 * checked by hand in the tests.
 *
 * Records only, never a chase: no streaks (D-023), no money (the Responsible-Play test), and no
 * worst records (PERSONAS: the Slump rule).
 */
import { formatRecord } from './scoring';
import type { StandingRow } from './standings';

/** Weeks a player needs before they can top Best pick rate, so one lucky week can't. */
export const MIN_WEEKS_FOR_RATE = 5;
/** Each list shows the top five places, with tied players sharing a place. */
export const TOP_PLACES = 5;
/** A tie that would make a list longer than this is summed up in words instead. */
export const MAX_ROWS = 8;

export interface HallSeason {
  year: string;
  rows: StandingRow[];
}

export interface HallEntry {
  playerId: string;
  displayName: string;
  place: number;
  tied: boolean;
  /** The headline, in words: "4 weeks won", "64% right". */
  value: string;
  /** The line under it, or null. */
  detail: string | null;
}

export interface HallList {
  key: 'titles' | 'rate' | 'bestWeek' | 'perfect' | 'weeks';
  title: string;
  /** What the list counts, in one plain sentence. */
  about: string;
  entries: HallEntry[];
  /** "And 4 others with 13 right." when a tie runs past the list, or null. */
  more: string | null;
  /** Shown when nobody is on the list yet. */
  empty: string;
}

interface Career {
  playerId: string;
  displayName: string;
  weeksPlayed: number;
  wins: number;
  losses: number;
  weeklyTitles: number;
  perfectWeeks: number;
  best: { wins: number; losses: number; year: string; weekId: string } | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "wk07" → "Week 7" (week numbers follow the NFL's, D-072). */
export function weekName(weekId: string): string {
  return `Week ${Number(weekId.replace(/\D/g, ''))}`;
}

/** Every player's totals across the seasons, under their most recent name. */
export function careers(seasons: HallSeason[]): Career[] {
  const byId = new Map<string, Career>();
  for (const season of [...seasons].sort((a, b) => a.year.localeCompare(b.year))) {
    for (const row of season.rows) {
      const c =
        byId.get(row.playerId) ??
        ({
          playerId: row.playerId,
          displayName: row.displayName,
          weeksPlayed: 0,
          wins: 0,
          losses: 0,
          weeklyTitles: 0,
          perfectWeeks: 0,
          best: null,
        } satisfies Career);
      c.displayName = row.displayName;
      c.weeksPlayed += row.weeksPlayed;
      c.wins += row.wins;
      c.losses += row.losses;
      c.weeklyTitles += row.weeklyTitles;
      for (const [weekId, r] of Object.entries(row.weekRecords).sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        // Every game right. A tied game counts as a miss for everyone (D-008), so it can't be.
        if (r.losses === 0 && r.wins > 0) c.perfectWeeks += 1;
        // The earliest week wins a tie with itself: the record was set then.
        if (!c.best || r.wins > c.best.wins) c.best = { ...r, year: season.year, weekId };
      }
      byId.set(row.playerId, c);
    }
  }
  return [...byId.values()];
}

export interface Placed<T> {
  rows: { item: T; place: number; tied: boolean }[];
  /** How many tied players were cut from the end, and one of them (for their number). */
  more: number;
  cut: T | null;
}

/**
 * The top places by a number, highest first, players level on it sharing a place. A tie that would
 * run past MAX_ROWS is cut and counted in `more`, unless it is the only group left.
 */
export function topPlaces<T extends { displayName: string }>(
  items: T[],
  score: (item: T) => number,
): Placed<T> {
  const sorted = [...items].sort(
    (a, b) => score(b) - score(a) || a.displayName.localeCompare(b.displayName),
  );
  const placed = sorted.map((item) => ({
    item,
    place: 1 + sorted.filter((o) => score(o) > score(item)).length,
    tied: sorted.filter((o) => score(o) === score(item)).length > 1,
  }));
  const shown = placed.filter((p) => p.place <= TOP_PLACES);
  if (shown.length <= MAX_ROWS) return { rows: shown, more: 0, cut: null };
  const lastPlace = shown[shown.length - 1].place;
  const before = shown.filter((p) => p.place < lastPlace).length;
  const keep = before > 0 ? before : MAX_ROWS;
  return { rows: shown.slice(0, keep), more: shown.length - keep, cut: shown[keep].item };
}

function list(
  base: Omit<HallList, 'entries' | 'more'>,
  ranked: Placed<Career>,
  value: (c: Career) => string,
  detail: (c: Career) => string | null,
  moreValue: (c: Career) => string = value,
): HallList {
  return {
    ...base,
    entries: ranked.rows.map(({ item, place, tied }) => ({
      playerId: item.playerId,
      displayName: item.displayName,
      place,
      tied,
      value: value(item),
      detail: detail(item),
    })),
    more: ranked.cut
      ? `And ${plural(ranked.more, 'other', 'others')} with ${moreValue(ranked.cut)}.`
      : null,
  };
}

const rate = (c: Career) => (c.wins + c.losses === 0 ? 0 : c.wins / (c.wins + c.losses));
const percent = (c: Career) => `${Math.round(rate(c) * 100)}% right`;
const over = (c: Career) =>
  `${formatRecord(c.wins, c.losses)} over ${plural(c.weeksPlayed, 'week', 'weeks')}`;

/** The five lists, in the order the page shows them. */
export function hallOfFame(seasons: HallSeason[]): HallList[] {
  const all = careers(seasons);

  const titles = topPlaces(
    all.filter((c) => c.weeklyTitles > 0),
    (c) => c.weeklyTitles,
  );
  const rated = topPlaces(
    all.filter((c) => c.weeksPlayed >= MIN_WEEKS_FOR_RATE && c.wins + c.losses > 0),
    rate,
  );
  const bestWeek = topPlaces(
    all.filter((c) => c.best && c.best.wins > 0),
    (c) => c.best!.wins,
  );
  const perfect = topPlaces(
    all.filter((c) => c.perfectWeeks > 0),
    (c) => c.perfectWeeks,
  );
  const weeks = topPlaces(
    all.filter((c) => c.weeksPlayed > 0),
    (c) => c.weeksPlayed,
  );

  return [
    list(
      {
        key: 'titles',
        title: 'Most weekly wins',
        about: 'Weeks won. A split pot counts for each winner.',
        empty: 'No winners yet. The first one goes up when a week is final.',
      },
      titles,
      (c) => plural(c.weeklyTitles, 'week won', 'weeks won'),
      () => null,
    ),
    list(
      {
        key: 'rate',
        title: 'Best pick rate',
        about: `The share of picks right, for players with ${MIN_WEEKS_FOR_RATE} or more weeks.`,
        empty: `Nobody has played ${MIN_WEEKS_FOR_RATE} weeks yet.`,
      },
      rated,
      percent,
      over,
    ),
    list(
      {
        key: 'bestWeek',
        title: 'Best single week',
        about: 'The most picks right in one week. Each player’s best week.',
        empty: 'No weeks are final yet.',
      },
      bestWeek,
      (c) => `${c.best!.wins} of ${c.best!.wins + c.best!.losses} right`,
      (c) => `${weekName(c.best!.weekId)}, ${c.best!.year}`,
      // Weeks can have different numbers of games, so a cut tie is told by picks right alone.
      (c) => `${c.best!.wins} right`,
    ),
    list(
      {
        key: 'perfect',
        title: 'Most perfect weeks',
        about: 'Every game right, Monday night included.',
        empty: 'No perfect weeks yet.',
      },
      perfect,
      (c) => plural(c.perfectWeeks, 'perfect week', 'perfect weeks'),
      () => null,
    ),
    list(
      {
        key: 'weeks',
        title: 'Most weeks played',
        about: 'The regulars: weeks with an entry, across every season.',
        empty: 'No weeks are final yet.',
      },
      weeks,
      (c) => plural(c.weeksPlayed, 'week', 'weeks'),
      () => null,
    ),
  ];
}
