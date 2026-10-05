import { useState } from 'react';
import { Link } from 'react-router-dom';
import { entryReminder, groupReminder, smsLink } from '@shared/messages';
import { entryWindow } from '@shared/paperEntry';
import { formatPoolDateTime } from '@shared/time';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { useToast } from '../../../components/ui/toastContext';
import { friendlyError } from '../../../lib/errors';
import { copyText } from '../../../lib/share';
import { useEntriesList } from '../payments/paymentsData';
import { useAdminWeek } from '../useAdminWeek';
import { WeekPicker } from '../WeekPicker';
import { PlayerForm } from './PlayerForm';
import {
  ROSTER_FILTER_LABELS,
  filterRoster,
  rosterCounts,
  rosterRows,
  type RosterFilter,
} from './roster';
import { useRoster } from './rosterData';
import { RosterRow } from './RosterRow';

const FILTERS = Object.keys(ROSTER_FILTER_LABELS) as RosterFilter[];

/**
 * The roster (PROJECT_PLAN Sprint 4): everyone who plays, who is in this week and who isn't yet, and
 * the way in to entering a paper sheet, a text, or a phone call for someone.
 */
export default function RosterPage() {
  const sel = useAdminWeek();
  const roster = useRoster();
  const week = sel.week;
  const entries = useEntriesList(sel.year, week?.id);
  const { showToast } = useToast();
  const [filter, setFilter] = useState<RosterFilter>('all');
  const [query, setQuery] = useState('');
  /** A player ID being edited, "new" for the add form, or null. */
  const [editing, setEditing] = useState<string | null>(null);
  // Which kind of entry the buttons offer, judged when the screen opens. The server decides for real.
  const [openedAt] = useState(() => Date.now());

  if (sel.isPending || roster.isPending) return <p role="status">Loading…</p>;
  if (sel.isError || roster.isError) {
    return (
      <p role="alert" className="font-semibold text-ink-urgent">
        {roster.isError
          ? friendlyError(roster.error)
          : "The weeks didn't load. Check your connection and refresh."}
      </p>
    );
  }

  const players = roster.data;
  const rows = rosterRows(players, entries.data?.rows ?? []);
  const counts = rosterCounts(rows);
  const shown = filterRoster(
    rows,
    week ? filter : filter === 'inactive' ? 'inactive' : 'all',
    query,
  );
  const window = week ? entryWindow(week, openedAt) : null;
  const canEnter = window !== null && window.mode !== 'closed';
  const showStatus = Boolean(week) && entries.isSuccess;
  const filters = week ? FILTERS : (['all', 'inactive'] as RosterFilter[]);

  function onSaved(_playerId: string, name: string, added: boolean) {
    setEditing(null);
    if (added) setQuery('');
    showToast({ message: added ? `${name} added to the roster` : `${name} saved` });
  }

  return (
    <div className="flex max-w-player flex-col gap-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-h2">Roster</h1>
        {week && (
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={week.status} />
            <WeekPicker weeks={sel.weeks} value={week.id} onChange={sel.select} />
          </div>
        )}
      </div>

      {week ? (
        <p className="text-body text-ink-muted">
          {counts.entered} entered, {counts.not_yet} not yet. Picks{' '}
          {window?.mode === 'open' ? 'lock' : 'locked'}{' '}
          {formatPoolDateTime(new Date(week.lockAtMs))}.
          {window?.mode === 'late' && ' After the lock, an entry needs a reason.'}
          {window?.mode === 'backfill' &&
            ' This week was backfilled, so sheets go in as normal entries.'}
          {window?.mode === 'closed' && ` ${window.message}`}
        </p>
      ) : (
        <p className="text-body text-ink-muted">
          No week is open yet, so there are no picks to enter.{' '}
          <Link to="/admin/weeks" className="underline">
            Set up a week
          </Link>
        </p>
      )}
      {entries.isError && (
        <p role="alert" className="font-semibold text-ink-urgent">
          This week's entries didn't load, so "Entered" and "Not yet" aren't shown.{' '}
          {friendlyError(entries.error)}
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
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className="min-h-touch rounded-pill border-2 border-line-strong px-4 font-heading text-h3 aria-pressed:bg-purple-700 aria-pressed:text-ink-inverse"
          >
            {ROSTER_FILTER_LABELS[f]} <span className="font-body text-body">{counts[f]}</span>
          </button>
        ))}
      </div>

      {week && window?.mode === 'open' && counts.not_yet > 0 && (
        <Button
          variant="ghost"
          onClick={async () =>
            showToast(
              (await copyText(groupReminder(week)))
                ? { message: 'Reminder copied. Paste it into the group chat.' }
                : { message: "Couldn't copy from this browser.", tone: 'error' },
            )
          }
        >
          Copy a reminder for the group chat
        </Button>
      )}

      {editing === 'new' ? (
        <PlayerForm
          player={null}
          roster={players}
          startName={query}
          onSaved={onSaved}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <Button variant="ghost" onClick={() => setEditing('new')}>
          Add a player
        </Button>
      )}

      {players.length === 0 && (
        <p className="text-body">
          Nobody is on the roster yet. Add the people who play on paper, by text, or by phone.
          Players who enter on the website show up here on their own.
        </p>
      )}
      {players.length > 0 && shown.length === 0 && (
        <p className="text-body">
          {query
            ? 'Nobody matches. Check the spelling, or add them as a new player.'
            : filter === 'not_yet'
              ? 'Everyone on the roster is in. Nice work!'
              : 'Nobody here.'}
        </p>
      )}

      <ul className="flex flex-col gap-2" aria-label="Players">
        {shown.map((row) =>
          editing === row.playerId ? (
            <li key={row.playerId}>
              <PlayerForm
                player={row}
                roster={players}
                onSaved={onSaved}
                onCancel={() => setEditing(null)}
                onLinkChange={(message) => {
                  setEditing(null);
                  showToast({ message });
                }}
              />
            </li>
          ) : (
            <RosterRow
              key={row.playerId}
              row={row}
              showStatus={showStatus}
              late={window?.mode === 'late'}
              enterHref={
                week && canEnter ? `/admin/enter/${row.playerId}${sel.search(week.id)}` : null
              }
              onEdit={() => setEditing(row.playerId)}
              reminderHref={
                week && window?.mode === 'open' && row.phone
                  ? smsLink(row.phone, entryReminder(row.displayName, week))
                  : undefined
              }
            />
          ),
        )}
      </ul>
    </div>
  );
}
