import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { CounterRow } from '@shared/adminTypes';
import { SOURCE_LABELS } from '@shared/paperEntry';
import { formatPoolDateTime } from '@shared/time';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useToast } from '../../components/ui/toastContext';
import { friendlyError } from '../../lib/errors';
import { currentSeason } from '../../lib/season';
import { useCurrentWeek } from '../entry/entryData';
import { CounterPlayerForm } from './CounterPlayerForm';
import {
  COUNTER_FILTER_LABELS,
  counterCounts,
  filterCounterRows,
  paymentWords,
  rowActions,
  type CounterFilter,
} from './counter';
import { useCashPayment, useCounterOverview } from './counterData';

const FILTERS = Object.keys(COUNTER_FILTER_LABELS) as CounterFilter[];

/**
 * The Counter (D-095, PERSONAS: Devon): this week's roster, who is in and who has paid, and the
 * three daily jobs: enter a sheet, take cash, add a walk-in. Anything bigger says "Ask the
 * commissioner". Names and status only: no phone, no email, no picks.
 */
export default function CounterPage() {
  const year = useSearchParams()[0].get('season') ?? currentSeason();
  const current = useCurrentWeek(year);
  const week = current.data ?? null;
  const overview = useCounterOverview(year, week?.id);
  const cash = useCashPayment(year, week?.id ?? '');
  const { showToast } = useToast();
  const [filter, setFilter] = useState<CounterFilter>('all');
  const [query, setQuery] = useState('');
  /** A player ID being fixed, "new" for the add form, or null. */
  const [editing, setEditing] = useState<string | null>(null);
  // Whether new sheets are offered, judged when the screen opens. The server decides for real.
  const [openedAt] = useState(() => Date.now());

  if (current.isPending) return <p role="status">Loading…</p>;
  if (current.isError) {
    return (
      <p role="alert" className="font-semibold text-ink-urgent">
        The week didn't load. Check your connection and refresh.
      </p>
    );
  }
  if (!week) {
    return (
      <div className="flex max-w-player flex-col gap-3">
        <h1 className="font-heading text-h2">Counter</h1>
        <p className="text-body">No week is open yet. Ask the commissioner.</p>
      </div>
    );
  }

  const open = week.status === 'open' && openedAt < week.lockAtMs;
  const rows = overview.data?.rows ?? [];
  const counts = counterCounts(rows);
  const shown = filterCounterRows(rows, filter, query);

  async function takeCash(row: CounterRow, status: 'paid' | 'unpaid') {
    try {
      await cash.mutateAsync({ playerId: row.playerId, status });
      showToast({
        message:
          status === 'paid'
            ? `${row.displayName}: cash received`
            : `${row.displayName}: cash undone`,
      });
    } catch (err) {
      showToast({ message: friendlyError(err), tone: 'error' });
    }
  }

  function onDone(message: string) {
    setEditing(null);
    setQuery('');
    showToast({ message });
  }

  return (
    <div className="flex max-w-player flex-col gap-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-h2">Counter</h1>
        <StatusBadge status={open ? 'open' : week.status === 'final' ? 'final' : 'locked'} />
      </div>
      <p className="text-body text-ink-muted">
        Week {week.weekNumber}. {counts.entered} in, {counts.not_yet} not yet. Picks{' '}
        {open ? 'lock' : 'locked'} {formatPoolDateTime(new Date(week.lockAtMs))}.
      </p>
      {!open && (
        <p className="rounded-md bg-gold-50 p-3 text-body text-gold-800">
          <span aria-hidden="true">ⓘ </span>
          <strong>Picks are locked.</strong> You can still take cash for a sheet that is already in.
          A new sheet needs the commissioner. Ask the commissioner.
        </p>
      )}

      {overview.isPending && (
        <p role="status" className="text-body">
          Loading the roster…
        </p>
      )}
      {overview.isError && (
        <p role="alert" className="font-semibold text-ink-urgent">
          The roster didn't load. {friendlyError(overview.error)}
        </p>
      )}

      <Field
        label="Find a player"
        hint="Part of a name."
        type="search"
        inputMode="search"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className="min-h-touch rounded-pill border-2 border-line-strong px-4 font-heading text-h3 aria-pressed:bg-purple-700 aria-pressed:text-ink-inverse"
          >
            {COUNTER_FILTER_LABELS[f]} <span className="font-body text-body">{counts[f]}</span>
          </button>
        ))}
      </div>

      {editing === 'new' ? (
        <CounterPlayerForm
          player={null}
          startName={query}
          onDone={onDone}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <Button variant="ghost" onClick={() => setEditing('new')}>
          Add a player
        </Button>
      )}

      {overview.isSuccess && shown.length === 0 && (
        <p className="text-body">
          {query
            ? 'Nobody matches. Check the spelling, or add them as a new player.'
            : filter === 'not_yet'
              ? 'Everyone on the roster is in. Nice work!'
              : 'Nobody here.'}
        </p>
      )}

      <ul className="flex flex-col gap-2" aria-label="Players">
        {shown.map((row) => {
          const actions = rowActions(row, open);
          const words = paymentWords(row);
          return editing === row.playerId ? (
            <li key={row.playerId}>
              <CounterPlayerForm player={row} onDone={onDone} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li
              key={row.playerId}
              className="flex flex-col gap-2 rounded-md border-2 border-line-subtle bg-surface p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2 font-heading text-h3">
                    <span className="break-words [overflow-wrap:anywhere]">{row.displayName}</span>
                    {!row.active && <span className="badge badge-draft">Inactive</span>}
                  </p>
                  <p className="flex flex-wrap items-center gap-2 text-body">
                    {row.entered ? (
                      <>
                        <span className="badge badge-open">
                          <span aria-hidden="true">✓</span>In
                        </span>
                        <StatusBadge status={row.paymentStatus === 'paid' ? 'paid' : 'unpaid'} />
                        <span className="text-ink-muted">{words}</span>
                        {row.late && <span className="badge badge-pending">Late entry</span>}
                        {row.source && row.source !== 'web' && (
                          <span className="text-ink-muted">{SOURCE_LABELS[row.source]}</span>
                        )}
                      </>
                    ) : (
                      <span className="badge badge-draft">Not yet</span>
                    )}
                  </p>
                  {actions.note && <p className="text-body text-ink-muted">{actions.note}</p>}
                </div>

                {actions.enter && (
                  <Link
                    to={`/counter/enter/${row.playerId}${year === currentSeason() ? '' : `?season=${year}`}`}
                    className="btn btn-primary flex-none px-3 text-center"
                    aria-label={`Enter picks for ${row.displayName}`}
                  >
                    Enter picks
                  </Link>
                )}
                {actions.markCash && (
                  <Button
                    variant="primary"
                    disabled={cash.isPending}
                    onClick={() => takeCash(row, 'paid')}
                    aria-label={`Paid cash: ${row.displayName}`}
                  >
                    Paid cash
                  </Button>
                )}
                {actions.undoCash && (
                  <Button
                    variant="ghost"
                    disabled={cash.isPending}
                    onClick={() => takeCash(row, 'unpaid')}
                    aria-label={`Undo cash: ${row.displayName}`}
                  >
                    Undo cash
                  </Button>
                )}
              </div>
              {actions.fix && (
                <div>
                  <button
                    type="button"
                    className="min-h-touch text-body text-ink-emphasis underline"
                    onClick={() => setEditing(row.playerId)}
                    aria-label={`Fix details for ${row.displayName}`}
                  >
                    Fix a detail
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
