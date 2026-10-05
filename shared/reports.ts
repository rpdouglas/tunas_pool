/**
 * The commissioner's season report (PROJECT_PLAN Sprint 7): one line per week with entries, money,
 * the winner, and the payout, plus a few plain facts about each week. Pure, so it is unit tested;
 * `adminSeasonReport` feeds it what it reads. Admin only: it names who hasn't paid.
 */
import type { GameResult, Pick } from './types';

export interface ReportWeekInput {
  weekId: string;
  weekNumber: number;
  status: string;
  entryFeeCents: number;
  games: { id: string; away: string; home: string }[];
  results: Record<string, GameResult | undefined>;
  winner: { displayNames: string[]; potCents: number; shareCents: number } | null;
  payoutSent: boolean;
  entries: {
    playerId: string;
    displayName: string;
    paid: boolean;
    picks: Record<string, Pick | undefined>;
    wins: number;
  }[];
}

export interface ReportWeek {
  weekId: string;
  weekNumber: number;
  status: string;
  entries: number;
  paid: number;
  unpaid: number;
  /** The published pot once final; before that, paid entries times the fee. */
  potCents: number;
  winners: string[];
  /** What each winner gets. Null until the winner is published. */
  shareCents: number | null;
  payoutSent: boolean;
  /** Players in their first week of the season, and players who had played before. */
  newPlayers: number;
  returningPlayers: number;
  /** Average correct picks, to one decimal. Null until a game is decided. */
  averageWins: number | null;
  unpaidNames: string[];
  /** The side the most entries took, in any game. */
  mostPicked: { team: string; count: number } | null;
  /** The decided game whose winner the fewest entries picked, when fewer than half did. */
  biggestUpset: { winner: string; loser: string; count: number } | null;
}

export interface SeasonReport {
  year: string;
  weeks: ReportWeek[];
  totals: { weeks: number; entries: number; players: number; potCents: number; unpaid: number };
}

export function buildSeasonReport(year: string, weeks: ReportWeekInput[]): SeasonReport {
  const seen = new Set<string>();
  const rows: ReportWeek[] = [];
  for (const week of [...weeks].sort((a, b) => a.weekNumber - b.weekNumber)) {
    const { entries } = week;
    const paid = entries.filter((e) => e.paid).length;
    const newPlayers = entries.filter((e) => !seen.has(e.playerId)).length;
    entries.forEach((e) => seen.add(e.playerId));
    const decided = week.games.filter((g) => week.results[g.id]).length;

    let mostPicked: ReportWeek['mostPicked'] = null;
    let biggestUpset: ReportWeek['biggestUpset'] = null;
    for (const game of week.games) {
      for (const side of ['away', 'home'] as const) {
        const count = entries.filter((e) => e.picks[game.id] === side).length;
        if (count > 0 && (!mostPicked || count > mostPicked.count)) {
          mostPicked = { team: game[side], count };
        }
      }
      const result = week.results[game.id];
      if ((result === 'away' || result === 'home') && entries.length > 0) {
        const count = entries.filter((e) => e.picks[game.id] === result).length;
        if (count * 2 < entries.length && (!biggestUpset || count < biggestUpset.count)) {
          biggestUpset = {
            winner: game[result],
            loser: game[result === 'home' ? 'away' : 'home'],
            count,
          };
        }
      }
    }

    rows.push({
      weekId: week.weekId,
      weekNumber: week.weekNumber,
      status: week.status,
      entries: entries.length,
      paid,
      unpaid: entries.length - paid,
      potCents: week.winner ? week.winner.potCents : paid * week.entryFeeCents,
      winners: week.winner?.displayNames ?? [],
      shareCents: week.winner?.shareCents ?? null,
      payoutSent: week.payoutSent,
      newPlayers,
      returningPlayers: entries.length - newPlayers,
      averageWins:
        decided > 0 && entries.length > 0
          ? Math.round((entries.reduce((sum, e) => sum + e.wins, 0) / entries.length) * 10) / 10
          : null,
      unpaidNames: entries
        .filter((e) => !e.paid)
        .map((e) => e.displayName)
        .sort((a, b) => a.localeCompare(b)),
      mostPicked,
      biggestUpset,
    });
  }
  return {
    year,
    weeks: rows,
    totals: {
      weeks: rows.length,
      entries: rows.reduce((sum, w) => sum + w.entries, 0),
      players: seen.size,
      potCents: rows.reduce((sum, w) => sum + w.potCents, 0),
      unpaid: rows.reduce((sum, w) => sum + w.unpaid, 0),
    },
  };
}

/** One CSV cell: quoted when it holds a comma, a quote, or a line break. */
function cell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const dollars = (cents: number | null) => (cents === null ? null : (cents / 100).toFixed(2));

/** The weekly table as CSV: what a spreadsheet needs to check the season's money. */
export function weeklyCsv(report: SeasonReport): string {
  const header = [
    'Week',
    'Status',
    'Entries',
    'Paid',
    'Unpaid',
    'Pot',
    'Winner',
    'Each winner gets',
    'Payout sent',
    'New players',
    'Returning players',
    'Average correct picks',
  ];
  const lines = report.weeks.map((w) =>
    [
      w.weekNumber,
      w.status,
      w.entries,
      w.paid,
      w.unpaid,
      dollars(w.potCents),
      w.winners.join(' & '),
      dollars(w.shareCents),
      w.winners.length ? (w.payoutSent ? 'yes' : 'no') : '',
      w.newPlayers,
      w.returningPlayers,
      w.averageWins,
    ]
      .map(cell)
      .join(','),
  );
  return [header.join(','), ...lines].join('\r\n') + '\r\n';
}

/** Every unpaid entry of the season, one per line. */
export function unpaidCsv(report: SeasonReport): string {
  const lines = report.weeks.flatMap((w) =>
    w.unpaidNames.map((name) => [w.weekNumber, w.status, name].map(cell).join(',')),
  );
  return ['Week,Status,Player', ...lines].join('\r\n') + '\r\n';
}
