import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { unpaidCsv, weeklyCsv, type ReportWeek } from '@shared/reports';
import { formatMoney } from '@shared/scoring';
import { Button } from '../../../components/ui/Button';
import { StatTile } from '../../../components/ui/StatTile';
import { useToast } from '../../../components/ui/toastContext';
import { adminApi } from '../../../lib/adminApi';
import { friendlyError } from '../../../lib/errors';
import { currentSeason } from '../../../lib/season';

const STATUS_WORD: Record<string, string> = { open: 'Open', locked: 'Locked', final: 'Final' };

/** Hand the browser a CSV file to save. */
function download(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * The season at a glance for the commissioner (PROJECT_PLAN Sprint 7): each week's entries, money,
 * winner, and payout, who still owes, and a few facts about the week. Tables first; charts are
 * parked. The CSV files are for checking the money in a spreadsheet.
 */
export default function ReportsPage() {
  const year = useSearchParams()[0].get('season') ?? currentSeason();
  const client = useQueryClient();
  const { showToast } = useToast();
  const report = useQuery({
    queryKey: ['adminSeasonReport', year],
    queryFn: () => adminApi.seasonReport({ year }),
  });
  const recompute = useMutation({
    mutationFn: () => adminApi.recomputeStandings({ year }),
    onSuccess: (res) => {
      void client.invalidateQueries({ queryKey: ['standings', year] });
      showToast({
        message: `Standings recalculated: ${res.players} ${res.players === 1 ? 'player' : 'players'}`,
      });
    },
    onError: (err) => showToast({ message: friendlyError(err), tone: 'error' }),
  });

  const data = report.data;
  return (
    <div className="flex flex-col gap-4 pb-24">
      <h1 className="font-heading text-h2">Reports · {year}</h1>

      {report.isPending && <p role="status">Adding up the season…</p>}
      {report.isError && (
        <p role="alert" className="font-semibold text-ink-urgent">
          {friendlyError(report.error)}
        </p>
      )}

      {data && (
        <>
          <div className="grid max-w-player grid-cols-2 gap-2">
            <StatTile compact label="Weeks" value={String(data.totals.weeks)} />
            <StatTile compact label="Players" value={String(data.totals.players)} />
            <StatTile compact label="Entries" value={String(data.totals.entries)} />
            <StatTile compact label="Pots" value={formatMoney(data.totals.potCents)} accent />
          </div>
          {data.totals.unpaid > 0 && (
            <p className="text-body">
              <strong>{data.totals.unpaid}</strong> unpaid{' '}
              {data.totals.unpaid === 1 ? 'entry' : 'entries'} across the season.
            </p>
          )}

          {data.weeks.length === 0 ? (
            <p className="text-body">No weeks yet. Weeks show up here once they are opened.</p>
          ) : (
            <ul className="flex flex-col gap-3" aria-label="Weeks">
              {[...data.weeks].reverse().map((week) => (
                <WeekCard key={week.weekId} week={week} />
              ))}
            </ul>
          )}

          <div className="flex max-w-player flex-col gap-2">
            <Button
              variant="primary"
              disabled={data.weeks.length === 0}
              onClick={() => download(`tunas-pool-${year}-weeks.csv`, weeklyCsv(data))}
            >
              Download weeks (CSV)
            </Button>
            <Button
              variant="ghost"
              disabled={data.totals.unpaid === 0}
              onClick={() => download(`tunas-pool-${year}-unpaid.csv`, unpaidCsv(data))}
            >
              Download unpaid entries (CSV)
            </Button>
            <p className="text-body-sm text-ink-muted">
              The unpaid list names players. Keep it to yourself.
            </p>
          </div>
        </>
      )}

      <div className="flex max-w-player flex-col gap-2 border-t-2 border-line-subtle pt-4">
        <p className="text-body">
          Season standings update on their own when a winner is published or corrected. If they ever
          look off, work them out again from the finished weeks.
        </p>
        <Button variant="ghost" disabled={recompute.isPending} onClick={() => recompute.mutate()}>
          {recompute.isPending ? 'Recalculating…' : 'Recalculate standings'}
        </Button>
      </div>
    </div>
  );
}

function WeekCard({ week }: { week: ReportWeek }) {
  const fact = (label: string, value: string) => (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
  return (
    <li className="max-w-player rounded-md border-2 border-line-subtle bg-surface p-3">
      <h2 className="font-heading text-h3">
        Week {week.weekNumber}{' '}
        <span className="font-body text-body font-normal text-ink-muted">
          · {STATUS_WORD[week.status] ?? week.status}
        </span>
      </h2>
      <dl className="divide-y divide-line-subtle text-body">
        {fact('Entries', `${week.entries} (${week.paid} paid, ${week.unpaid} unpaid)`)}
        {fact('Pot', formatMoney(week.potCents))}
        {fact(
          'Winner',
          week.winners.length
            ? `${week.winners.join(' & ')}${week.shareCents !== null && week.winners.length > 1 ? ` (${formatMoney(week.shareCents)} each)` : ''}`
            : 'Not published',
        )}
        {week.winners.length > 0 && fact('Payout', week.payoutSent ? 'Sent' : 'Not sent yet')}
        {fact('New / returning players', `${week.newPlayers} / ${week.returningPlayers}`)}
        {week.averageWins !== null && fact('Average correct picks', String(week.averageWins))}
        {week.mostPicked &&
          fact('Most-picked team', `${week.mostPicked.team} (${week.mostPicked.count})`)}
        {week.biggestUpset &&
          fact(
            'Biggest upset',
            `${week.biggestUpset.winner} over ${week.biggestUpset.loser} (${week.biggestUpset.count === 0 ? 'nobody' : week.biggestUpset.count} picked it)`,
          )}
      </dl>
      {week.unpaidNames.length > 0 && (
        <p className="mt-2 text-body">
          <strong>Unpaid:</strong> {week.unpaidNames.join(', ')}
        </p>
      )}
    </li>
  );
}
