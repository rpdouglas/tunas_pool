import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { POOL_URL } from '@shared/messages';
import { formatPoolDateTime } from '@shared/time';
import { kickoffLabel } from '@shared/weeks';
import { Button } from '../../components/ui/Button';
import { useGuestSession } from '../auth/useAuth';
import { usePoolConfig } from '../entry/entryData';
import { useRevealWeek } from '../leaderboard/revealData';

const site = POOL_URL.replace('https://', '');

/**
 * The paper sheet, made from the same week as the site so the two always match (PERSONAS: Rosalie,
 * PROJECT_PLAN Sprint 8). Games are numbered in the order the entry screens use, so copying a sheet
 * in is a straight read down the page. Large print is one tap. Team names only, no league marks
 * (CLAUDE.md §4.9).
 */
export default function SheetPage() {
  const { year = '', weekId = '' } = useParams();
  const session = useGuestSession();
  const week = useRevealWeek(year, weekId, Boolean(session.user));
  const config = usePoolConfig();
  const [large, setLarge] = useState(false);

  if (session.failed || week.isError) {
    return (
      <main className="p-4">
        <p role="alert">The sheet didn't load. Check your signal and refresh.</p>
      </main>
    );
  }
  if (!session.user || week.isPending || config.isPending) {
    return (
      <main className="p-4">
        <p role="status">Loading the sheet…</p>
      </main>
    );
  }
  if (!week.data) {
    return (
      <main className="flex flex-col gap-3 p-4">
        <p>That week isn't available.</p>
        <Link to="/" className="underline">
          Back to this week
        </Link>
      </main>
    );
  }

  const w = week.data;
  const games = [...w.games].sort((a, b) => a.order - b.order);
  const fee = `$${(w.entryFeeCents / 100).toFixed(0)}`;
  const box = (
    <span className="inline-block h-5 w-5 flex-none border-2 border-black" aria-hidden="true" />
  );
  const line = (
    <span className="inline-block min-w-32 flex-1 border-b-2 border-black" aria-hidden="true" />
  );

  return (
    <main className={`min-h-screen bg-white text-black ${large ? 'text-h3' : 'text-body'}`}>
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-line-subtle bg-surface-muted p-3 print:hidden">
        <Button variant="primary" onClick={() => window.print()}>
          Print
        </Button>
        <Button variant="ghost" aria-pressed={large} onClick={() => setLarge((v) => !v)}>
          {large ? 'Regular print' : 'Large print'}
        </Button>
        <Link to="/" className="inline-flex min-h-touch items-center px-2 underline">
          Back
        </Link>
      </div>

      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6 print:max-w-none print:p-0">
        <header className="border-b-4 border-black pb-2 text-center">
          <p className="font-display text-h1 uppercase">Tunas</p>
          <p className="font-heading text-h2 uppercase italic">Weekly Football Pool Pick 'Em</p>
          <p className="mt-1 font-heading text-h3">
            Week {w.weekNumber} · Entry {fee} · Picks lock{' '}
            {formatPoolDateTime(new Date(w.lockAtMs))}
          </p>
        </header>

        <p>
          Tick one team in every game. Most right wins the pot. If players tie, the closest
          tiebreaker guess at or over the real total wins.
        </p>

        <ol className="flex flex-col" aria-label="Games">
          {games.map((g) => (
            <li
              key={g.id}
              className="grid grid-cols-[2rem_1fr_auto_1fr] items-center gap-2 border-b border-black py-2"
            >
              <span className="font-heading font-bold">{g.order}.</span>
              <span className="flex items-center gap-2">
                {box}
                <span className="font-heading font-bold">{g.away}</span>
              </span>
              <span>at</span>
              <span className="flex items-center gap-2">
                {box}
                <span>
                  <span className="font-heading font-bold">{g.home}</span>
                  <span className="block text-body-sm">
                    {g.slot === 'mnf' ? 'Monday night' : kickoffLabel(g)}
                    {g.venueNote ? ` · ${g.venueNote}` : ''}
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ol>

        <p>
          <strong>Tiebreaker:</strong> total points in the Monday night game
        </p>
        <p className="flex items-end gap-2 pt-3">
          <strong>Total:</strong> {line}
        </p>
        <p className="flex items-end gap-2 pt-3">
          <strong>Name:</strong> {line}
        </p>
        <p className="flex items-end gap-2 pt-3">
          <strong>Phone:</strong> {line}
        </p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <strong>Paying {fee} by:</strong>
          <span className="flex items-center gap-2">{box} Cash</span>
          <span className="flex items-center gap-2">{box} e-Transfer</span>
          <span className="flex items-center gap-2">{box} Will do</span>
          <span className="flex items-center gap-2">{box} Already did</span>
        </p>

        <footer className="mt-2 flex flex-col gap-1 border-t-4 border-black pt-2">
          <p>
            e-Transfer to <strong>{config.data?.etransferEmail}</strong>. Put your name in the
            message. Only paid entries can win.
          </p>
          <p>
            Play online at <strong>{site}</strong>. Played on paper before? Link your history at{' '}
            <strong>{site}/claim</strong>.
          </p>
          <p>
            Questions: <strong>{config.data?.contactEmail}</strong>
          </p>
        </footer>
      </div>
    </main>
  );
}
