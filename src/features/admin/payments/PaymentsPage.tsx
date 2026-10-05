import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatPoolDateTime } from '@shared/time';
import { formatMoney } from '@shared/scoring';
import type { PaymentMethod } from '@shared/types';
import { Field } from '../../../components/ui/Field';
import { StatTile } from '../../../components/ui/StatTile';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { useToast } from '../../../components/ui/toastContext';
import { friendlyError } from '../../../lib/errors';
import { useAdminWeek } from '../useAdminWeek';
import { WeekPicker } from '../WeekPicker';
import { useEntriesList, useSetPayment } from './paymentsData';
import { PaymentRow } from './PaymentRow';
import { FILTER_LABELS, filterRows, queueCounts, type QueueFilter } from './queue';

const FILTERS = Object.keys(FILTER_LABELS) as QueueFilter[];

/** The Back Office home screen: who has entered, who has paid, and one tap to confirm (Sprint 3). */
export default function PaymentsPage() {
  const sel = useAdminWeek();
  if (sel.isPending) return <p role="status">Loading…</p>;
  if (sel.isError) {
    return (
      <p role="alert" className="font-semibold text-ink-urgent">
        The weeks didn't load. Check your connection and refresh.
      </p>
    );
  }
  if (!sel.week) {
    return (
      <div className="flex max-w-player flex-col gap-3">
        <h1 className="font-heading text-h2">Payments</h1>
        <p className="text-body">
          No week is open yet. Set up a week and open it, then payments show up here as players
          enter.
        </p>
        <Link to="/admin/weeks" className="btn btn-primary">
          Set up a week
        </Link>
      </div>
    );
  }
  return <PaymentsForWeek key={`${sel.year}/${sel.week.id}`} sel={sel} />;
}

function PaymentsForWeek({ sel }: { sel: ReturnType<typeof useAdminWeek> }) {
  const week = sel.week!;
  const list = useEntriesList(sel.year, week.id);
  const setPayment = useSetPayment(sel.year, week.id);
  const { showToast } = useToast();
  const [filter, setFilter] = useState<QueueFilter>('unpaid');
  const [query, setQuery] = useState('');

  const rows = list.data?.rows ?? [];
  const fee = list.data?.entryFeeCents ?? week.entryFeeCents;
  const counts = queueCounts(rows, fee);
  const shown = filterRows(rows, filter, query);

  function pay(playerId: string, name: string, method?: PaymentMethod) {
    setPayment.mutate(
      { playerId, status: 'paid', method },
      {
        onSuccess: () =>
          showToast({
            message: `${name} marked paid`,
            actionLabel: 'Undo',
            onAction: () => undo(playerId, name),
          }),
        onError: (err) => showToast({ message: friendlyError(err), tone: 'error' }),
      },
    );
  }

  function undo(playerId: string, name: string) {
    setPayment.mutate(
      { playerId, status: 'unpaid' },
      {
        onSuccess: () => showToast({ message: `${name} back to unpaid` }),
        onError: (err) => showToast({ message: friendlyError(err), tone: 'error' }),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-h2">Payments</h1>
        <div className="flex items-center gap-3">
          <StatusBadge status={week.status} />
          <WeekPicker weeks={sel.weeks} value={week.id} onChange={sel.select} />
        </div>
      </div>
      <p className="text-body text-ink-muted">
        Picks {week.status === 'open' ? 'lock' : 'locked'}{' '}
        {formatPoolDateTime(new Date(week.lockAtMs))}.{' '}
        <Link to={`/admin/results${sel.search(week.id)}`} className="underline">
          Results
        </Link>
      </p>

      <div className="grid grid-cols-3 gap-2">
        <StatTile compact label="Pot" value={formatMoney(counts.potCents)} accent />
        <StatTile compact label="Paid" value={`${counts.paid}/${counts.total}`} />
        <StatTile compact label="Unpaid" value={String(counts.unpaid)} />
      </div>
      {counts.unpaid > 0 && (
        <p className="text-body-sm text-ink-muted">
          If everyone pays the pot is {formatMoney(counts.ifEveryonePaidCents)}. Only paid entries
          count and can win.
        </p>
      )}

      <Field
        label="Find a player"
        hint="Part of a name or phone number."
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
            {FILTER_LABELS[f]} <span className="font-body text-body">{counts.byFilter[f]}</span>
          </button>
        ))}
      </div>

      {list.isPending && <p role="status">Loading entries…</p>}
      {list.isError && (
        <p role="alert" className="font-semibold text-ink-urgent">
          {friendlyError(list.error)}
        </p>
      )}
      {list.isSuccess && rows.length === 0 && (
        <p className="text-body">
          No entries yet. They show up here as players submit their picks.
        </p>
      )}
      {list.isSuccess && rows.length > 0 && shown.length === 0 && (
        <p className="text-body">
          {filter === 'unpaid' && !query
            ? 'Everyone has paid. Nice work!'
            : 'Nobody matches. Try a different filter or search.'}
        </p>
      )}

      <ul className="flex flex-col gap-2" aria-label="Entries">
        {shown.map((row) => (
          <PaymentRow
            key={row.playerId}
            row={row}
            busy={setPayment.isPending && setPayment.variables?.playerId === row.playerId}
            onPay={(method) => pay(row.playerId, row.displayName, method)}
            onUndo={() => undo(row.playerId, row.displayName)}
            picksHref={
              week.status === 'final'
                ? undefined
                : `/admin/enter/${row.playerId}${sel.search(week.id)}`
            }
          />
        ))}
      </ul>
    </div>
  );
}
