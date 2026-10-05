import { Link } from 'react-router-dom';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { formatPoolDate, formatPoolDateTime } from '@shared/time';
import { sundayOf } from '@shared/weeks';
import { currentSeason } from './season';
import { useSeasonWeeks } from './weekData';

/** Admin home for now: this season's weeks. The payments queue becomes home in Sprint 3. */
export default function WeeksPage() {
  const year = currentSeason();
  const weeks = useSeasonWeeks(year);
  const list = weeks.data ?? [];
  const nextNumber = list.length ? Math.max(...list.map((w) => w.weekNumber)) + 1 : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-h2">{year} weeks</h1>
        <Link to={`/admin/weeks/${year}/new`} className="btn btn-primary">
          Set up week {nextNumber}
        </Link>
      </div>

      {weeks.isPending && <p role="status">Loading weeks…</p>}
      {weeks.isError && (
        <p role="alert" className="font-semibold text-ink-urgent">
          The weeks didn't load. Check your connection and refresh.
        </p>
      )}
      {weeks.isSuccess && list.length === 0 && (
        <p className="text-body">No weeks yet. Set up your first week to get started.</p>
      )}

      <ul className="flex flex-col gap-2">
        {list.map((w) => {
          const sunday = sundayOf(w.games);
          return (
            <li key={w.id}>
              <Link
                to={`/admin/weeks/${year}/${w.id}`}
                className="flex min-h-14 items-center justify-between gap-3 rounded-md border-2 border-line-subtle bg-surface px-4 py-2"
              >
                <span className="flex flex-col">
                  <span className="font-heading text-h3">Week {w.weekNumber}</span>
                  <span className="text-body-sm text-ink-muted">
                    {sunday ? `${formatPoolDate(sunday)} · ` : ''}
                    Locks {formatPoolDateTime(new Date(w.lockAtMs), { weekday: 'short' })}
                  </span>
                </span>
                <StatusBadge status={w.status} />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
