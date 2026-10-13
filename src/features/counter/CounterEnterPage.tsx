import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { counterEntryCheck } from '@shared/counterPolicy';
import { entryWindow } from '@shared/paperEntry';
import { useToast } from '../../components/ui/toastContext';
import { friendlyError } from '../../lib/errors';
import { currentSeason } from '../../lib/season';
import { useCurrentWeek } from '../entry/entryData';
import { PaperEntryForm } from '../admin/entries/PaperEntryForm';
import type { AdminEntryView } from '../admin/entries/adminEntryData';
import { useCounterOverview } from './counterData';

/**
 * Entering a sheet at the counter: the same form the commissioner uses, but for a new sheet only,
 * while the week is open, with at most cash marked paid. Everything else says "Ask the
 * commissioner" before Devon types anything.
 */
export default function CounterEnterPage() {
  const { playerId = '' } = useParams();
  const year = useSearchParams()[0].get('season') ?? currentSeason();
  const current = useCurrentWeek(year);
  const week = current.data ?? null;
  const overview = useCounterOverview(year, week?.id);
  const navigate = useNavigate();
  const { showToast } = useToast();
  // Which kind of entry this is, judged once when the screen opens. The server decides for real.
  const [openedAt] = useState(() => Date.now());
  const back = '/counter';

  if (current.isPending || overview.isPending) return <p role="status">Loading…</p>;
  if (current.isError || overview.isError) {
    return (
      <p role="alert" className="font-semibold text-ink-urgent">
        {friendlyError(current.error ?? overview.error)}
      </p>
    );
  }

  const row = overview.data?.rows.find((r) => r.playerId === playerId) ?? null;
  const problem = !week
    ? 'No week is open yet. Ask the commissioner.'
    : !row
      ? "That player isn't on the roster."
      : (() => {
          const check = counterEntryCheck({
            windowMode: entryWindow(week, openedAt).mode,
            playerName: row.displayName,
            playerActive: row.active,
            entryExists: row.entered,
            markPaid: null,
          });
          return check.ok ? null : check.message;
        })();

  if (problem || !week || !row) {
    return (
      <div className="flex max-w-player flex-col gap-3">
        <h1 className="font-heading text-h2">Enter picks</h1>
        <p className="text-body">{problem}</p>
        <Link to={back} className="btn btn-primary">
          Back to the counter
        </Link>
      </div>
    );
  }

  const view: AdminEntryView = {
    player: {
      playerId: row.playerId,
      displayName: row.displayName,
      usualPayment: null,
      active: true,
    },
    entry: null,
    picks: null,
    payment: null,
  };

  return (
    <PaperEntryForm
      year={year}
      week={week}
      view={view}
      late={false}
      counter
      backLabel="Counter"
      backHref={back}
      onSaved={({ name, paid }) => {
        showToast({ message: `${name}: picks saved${paid ? ', cash received' : ''}` });
        navigate(back);
      }}
      onRemoved={() => navigate(back)}
    />
  );
}
