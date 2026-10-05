import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { entryWindow } from '@shared/paperEntry';
import { useToast } from '../../../components/ui/toastContext';
import { friendlyError } from '../../../lib/errors';
import { useAdminWeek } from '../useAdminWeek';
import { useAdminEntry } from './adminEntryData';
import { PaperEntryForm } from './PaperEntryForm';

/** "Entering for someone": the admin copies a paper sheet, a text, or a phone call (Sprint 4). */
export default function PaperEntryPage() {
  const { playerId = '' } = useParams();
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
        <h1 className="font-heading text-h2">Enter picks</h1>
        <p className="text-body">No week is open yet. Set up a week and open it first.</p>
        <Link to="/admin/weeks" className="btn btn-primary">
          Set up a week
        </Link>
      </div>
    );
  }
  return (
    <EntryForWeek key={`${sel.year}/${sel.week.id}/${playerId}`} sel={sel} playerId={playerId} />
  );
}

function EntryForWeek({
  sel,
  playerId,
}: {
  sel: ReturnType<typeof useAdminWeek>;
  playerId: string;
}) {
  const week = sel.week!;
  const view = useAdminEntry(sel.year, week.id, playerId);
  const navigate = useNavigate();
  const { showToast } = useToast();
  // Which kind of entry this is, judged once when the screen opens. The server decides for real.
  const [openedAt] = useState(() => Date.now());
  const backHref = `/admin/roster${sel.search(week.id)}`;

  if (view.isPending) return <p role="status">Loading…</p>;
  if (view.isError) {
    return (
      <p role="alert" className="font-semibold text-ink-urgent">
        {friendlyError(view.error)}
      </p>
    );
  }

  const window = entryWindow(week, openedAt);
  const problem = !view.data.player
    ? "That player isn't on the roster."
    : !view.data.player.active
      ? `${view.data.player.displayName} is marked inactive. Make them active on the roster first.`
      : window.mode === 'closed'
        ? window.message
        : null;
  if (problem) {
    return (
      <div className="flex max-w-player flex-col gap-3">
        <h1 className="font-heading text-h2">Enter picks</h1>
        <p className="text-body">{problem}</p>
        <Link to={backHref} className="btn btn-primary">
          Back to the roster
        </Link>
      </div>
    );
  }

  return (
    <PaperEntryForm
      year={sel.year}
      week={week}
      view={view.data}
      late={window.mode === 'late'}
      backHref={backHref}
      onSaved={({ name, paid, late }) => {
        showToast({
          message: `${name}: ${late ? 'late entry' : 'picks'} saved${paid ? ', marked paid' : ''}`,
        });
        navigate(backHref);
      }}
      onRemoved={(name) => {
        showToast({ message: `${name}: entry removed` });
        navigate(backHref);
      }}
    />
  );
}
