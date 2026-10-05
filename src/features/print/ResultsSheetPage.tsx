import { Link, useParams } from 'react-router-dom';
import { leaderboard, rankLabel } from '@shared/reveal';
import { explainOutcome, formatMoney, formatRecord } from '@shared/scoring';
import { formatPoolDateTime } from '@shared/time';
import { Button } from '../../components/ui/Button';
import { useGuestSession } from '../auth/useAuth';
import { useRevealEntries, useRevealWeek } from '../leaderboard/revealData';

/**
 * The week's results on paper, for the shop counter (PERSONAS: Rosalie, "results she can hear or
 * read"): the winner, how it was decided, and everyone's record. Names and records only, the same
 * as the week page shows. Nothing prints before picks are revealed (CLAUDE.md §4.3).
 */
export default function ResultsSheetPage() {
  const { year = '', weekId = '' } = useParams();
  const session = useGuestSession();
  const week = useRevealWeek(year, weekId, Boolean(session.user));
  const revealed = week.data?.revealed === true;
  const entries = useRevealEntries(year, weekId, revealed && Boolean(session.user));
  const back = `/week/${year}/${weekId}`;

  if (session.failed || week.isError || entries.isError) {
    return (
      <main className="p-4">
        <p role="alert">The results didn't load. Check your signal and refresh.</p>
      </main>
    );
  }
  if (!session.user || week.isPending || (revealed && entries.isPending)) {
    return (
      <main className="p-4">
        <p role="status">Loading the results…</p>
      </main>
    );
  }
  if (!week.data || !revealed) {
    return (
      <main className="flex flex-col gap-3 p-4">
        <p>
          {week.data
            ? 'Results can be printed once picks are locked.'
            : "That week isn't available."}
        </p>
        <Link to="/" className="underline">
          Back to this week
        </Link>
      </main>
    );
  }

  const w = week.data;
  const all = entries.data ?? [];
  const gameIds = w.games.map((g) => g.id);
  const rows = leaderboard(all, gameIds, w.results);
  const decided = gameIds.filter((id) => w.results[id]).length;
  const winner = w.status === 'final' ? w.winner : null;
  const byId = new Map(all.map((e) => [e.playerId, e.displayName]));

  return (
    <main className="min-h-screen bg-white text-h3 text-black">
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-line-subtle bg-surface-muted p-3 text-body print:hidden">
        <Button variant="primary" onClick={() => window.print()}>
          Print
        </Button>
        <Link to={back} className="inline-flex min-h-touch items-center px-2 underline">
          Back
        </Link>
      </div>

      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6 print:max-w-none print:p-0">
        <header className="border-b-4 border-black pb-2 text-center">
          <p className="font-display text-h1 uppercase">Tunas</p>
          <p className="font-heading text-h2 uppercase italic">Week {w.weekNumber} results</p>
        </header>

        {winner ? (
          <section aria-label="Winner" className="border-4 border-black p-3 text-center">
            <p className="font-heading uppercase">
              {winner.playerIds.length > 1 ? 'Winners' : 'Winner'}
            </p>
            <p className="font-heading text-h1 italic">{winner.displayNames.join(' & ')}</p>
            <p className="font-heading text-h2">
              {formatRecord(winner.record.wins, winner.record.losses)} ·{' '}
              {winner.playerIds.length > 1
                ? `${formatMoney(winner.shareCents)} each`
                : `Pot ${formatMoney(winner.potCents)}`}
            </p>
            <p className="mt-2 text-body">
              {explainOutcome(
                winner,
                w.mnfTotal,
                winner.tiedPlayerIds.map((id) => byId.get(id) ?? ''),
              )}
            </p>
            {w.correctedAtMs !== null && (
              <p className="mt-1 text-body">
                Result corrected{' '}
                {formatPoolDateTime(new Date(w.correctedAtMs), { weekday: 'short' })}.
              </p>
            )}
          </section>
        ) : (
          <p>
            {decided} of {gameIds.length} games decided. The winner is announced once every game is
            in.
          </p>
        )}

        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Standings for week {w.weekNumber}</caption>
          <thead>
            <tr className="border-b-4 border-black">
              <th scope="col" className="py-1 pr-2">
                Place
              </th>
              <th scope="col" className="py-1 pr-2">
                Player
              </th>
              <th scope="col" className="py-1 text-right">
                Record
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.playerId} className="border-b border-black">
                <td className="py-1 pr-2">{rankLabel(row)}</td>
                <td className="py-1 pr-2">
                  {row.displayName}
                  {row.late ? ' (late entry)' : ''}
                </td>
                <td className="py-1 text-right font-bold">{formatRecord(row.wins, row.losses)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p>Nobody entered this week.</p>}
        {w.backfilled && (
          <p className="text-body">
            Picks for this week were entered from the paper sheets afterwards.
          </p>
        )}
      </div>
    </main>
  );
}
