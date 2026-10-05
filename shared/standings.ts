/**
 * Season standings and all-time stats, worked out from the final weeks (PROJECT_PLAN Sprint 7,
 * docs/DATA_MODEL.md §3.2, §3.8). Pure, so the numbers can be checked by hand in the tests. The
 * functions feed it what they read and write what it returns.
 *
 * No streaks, anywhere (D-023). Weekly framing first: the standings are a record, not a chase.
 */

export interface SeasonWeek {
  weekId: string;
  weekNumber: number;
  /** Only final weeks count toward standings and stats. */
  status: string;
  /** The published winners of the week. */
  winnerIds: string[];
  /** Every entry's record for the week. */
  records: { playerId: string; wins: number; losses: number }[];
}

export interface StandingRow {
  playerId: string;
  displayName: string;
  weeksPlayed: number;
  wins: number;
  losses: number;
  weeklyTitles: number;
  weekRecords: Record<string, { wins: number; losses: number }>;
}

export interface StandingsPlayer {
  playerId: string;
  displayName: string;
  /**
   * On the roster, or linked to a saved login. Guest-only players are weekly only (PROJECT_PLAN §7
   * open decision 7): a guest login can vanish with the browser's storage, so a season line for it
   * would be a line nobody can come back to.
   */
  eligible: boolean;
}

/** One row per eligible player who played at least one final week. */
export function buildStandings(weeks: SeasonWeek[], players: StandingsPlayer[]): StandingRow[] {
  const byId = new Map(players.map((p) => [p.playerId, p]));
  const rows = new Map<string, StandingRow>();
  for (const week of weeks) {
    if (week.status !== 'final') continue;
    for (const record of week.records) {
      const player = byId.get(record.playerId);
      if (!player?.eligible) continue;
      const row =
        rows.get(record.playerId) ??
        ({
          playerId: record.playerId,
          displayName: player.displayName,
          weeksPlayed: 0,
          wins: 0,
          losses: 0,
          weeklyTitles: 0,
          weekRecords: {},
        } satisfies StandingRow);
      row.weeksPlayed += 1;
      row.wins += record.wins;
      row.losses += record.losses;
      row.weekRecords[week.weekId] = { wins: record.wins, losses: record.losses };
      if (week.winnerIds.includes(record.playerId)) row.weeklyTitles += 1;
      rows.set(record.playerId, row);
    }
  }
  return rankStandings([...rows.values()]);
}

/** Most correct picks first, then the better win rate, then the name. */
export function rankStandings<T extends { displayName: string; wins: number; losses: number }>(
  rows: T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      b.wins - a.wins || winRate(b) - winRate(a) || a.displayName.localeCompare(b.displayName),
  );
}

function winRate(row: { wins: number; losses: number }): number {
  const games = row.wins + row.losses;
  return games === 0 ? 0 : row.wins / games;
}

/** "63%", or a dash before any game is decided. */
export function winPercent(row: { wins: number; losses: number }): string {
  const games = row.wins + row.losses;
  return games === 0 ? '–' : `${Math.round((row.wins / games) * 100)}%`;
}

/** The place of each row: players level on wins share a place. */
export function standingPlaces(rows: { wins: number }[]): { place: number; tied: boolean }[] {
  return rows.map((row) => ({
    place: 1 + rows.filter((other) => other.wins > row.wins).length,
    tied: rows.filter((other) => other.wins === row.wins).length > 1,
  }));
}

/** The best single week on a standings row, by wins, as its week ID. Null if none. */
export function bestWeek(
  weekRecords: Record<string, { wins: number; losses: number }>,
): { weekId: string; wins: number; losses: number } | null {
  let best: { weekId: string; wins: number; losses: number } | null = null;
  for (const [weekId, r] of Object.entries(weekRecords).sort(([a], [b]) => a.localeCompare(b))) {
    if (!best || r.wins > best.wins) best = { weekId, ...r };
  }
  return best;
}

export interface AllTimeStats {
  weeksPlayed: number;
  wins: number;
  losses: number;
  weeklyTitles: number;
  bestWeekRecord: { wins: number; losses: number } | null;
  /** "2026/wk05": the latest final week played. */
  lastPlayedWeek: string | null;
}

/** All-time stats for every player with an entry in a final week, across the seasons given. */
export function buildAllTime(
  seasons: { year: string; weeks: SeasonWeek[] }[],
): Map<string, AllTimeStats> {
  const stats = new Map<string, AllTimeStats>();
  const ordered = [...seasons].sort((a, b) => a.year.localeCompare(b.year));
  for (const season of ordered) {
    const weeks = [...season.weeks].sort((a, b) => a.weekNumber - b.weekNumber);
    for (const week of weeks) {
      if (week.status !== 'final') continue;
      for (const record of week.records) {
        const s =
          stats.get(record.playerId) ??
          ({
            weeksPlayed: 0,
            wins: 0,
            losses: 0,
            weeklyTitles: 0,
            bestWeekRecord: null,
            lastPlayedWeek: null,
          } satisfies AllTimeStats);
        s.weeksPlayed += 1;
        s.wins += record.wins;
        s.losses += record.losses;
        if (week.winnerIds.includes(record.playerId)) s.weeklyTitles += 1;
        if (!s.bestWeekRecord || record.wins > s.bestWeekRecord.wins) {
          s.bestWeekRecord = { wins: record.wins, losses: record.losses };
        }
        s.lastPlayedWeek = `${season.year}/${week.weekId}`;
        stats.set(record.playerId, s);
      }
    }
  }
  return stats;
}
