import { Link } from 'react-router-dom';
import { SOURCE_LABELS } from '@shared/paperEntry';
import { formatPhone } from '@shared/phone';
import type { EntrySource } from '@shared/types';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import type { RosterRow as Row } from './roster';

export interface RosterRowProps {
  row: Row;
  /** Where "Enter picks" goes. Null when no week can take entries right now. */
  enterHref: string | null;
  /** True once picks are locked: the button says "Late entry". */
  late: boolean;
  /** False when there is no week to compare against, so no Entered / Not yet is shown. */
  showStatus: boolean;
  onEdit: () => void;
}

/**
 * One player on the roster (DESIGN_SYSTEM §6): name, whether they are in this week, and one button
 * to enter their picks. Answers "did you get mine?" at a glance (PERSONAS: Rosalie).
 */
export function RosterRow({ row, enterHref, late, showStatus, onEdit }: RosterRowProps) {
  const { entry } = row;
  const source =
    entry && entry.source !== 'web' ? SOURCE_LABELS[entry.source as EntrySource] : null;

  return (
    <li className="flex flex-col gap-2 rounded-md border-2 border-line-subtle bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex flex-wrap items-center gap-2 font-heading text-h3">
            <span className="break-words">{row.displayName}</span>
            {!row.active && <span className="badge badge-draft">Inactive</span>}
            {row.claimed && row.origin === 'admin' && (
              <span className="badge badge-open">Linked</span>
            )}
          </p>
          {showStatus && (
            <p className="flex flex-wrap items-center gap-2 text-body">
              {entry ? (
                <>
                  <span className="badge badge-open">
                    <span aria-hidden="true">✓</span>Entered
                  </span>
                  <StatusBadge status={entry.paymentStatus} />
                  {entry.lateOverride && <span className="badge badge-pending">Late entry</span>}
                  {source && <span className="text-ink-muted">{source}</span>}
                </>
              ) : (
                <span className="badge badge-draft">Not yet</span>
              )}
            </p>
          )}
          {row.phone && (
            <a
              href={`tel:${row.phone}`}
              className="inline-flex min-h-touch items-center text-body underline"
            >
              {formatPhone(row.phone)}
            </a>
          )}
          {row.notes && <p className="break-words text-body text-ink-muted">{row.notes}</p>}
        </div>

        {enterHref && row.active && (
          <Link
            to={enterHref}
            className={`btn ${entry ? 'btn-ghost' : 'btn-primary'} flex-none px-3 text-center`}
            aria-label={`${entry ? 'Edit picks' : late ? 'Late entry' : 'Enter picks'} for ${row.displayName}`}
          >
            {entry ? 'Edit picks' : late ? 'Late entry' : 'Enter picks'}
          </Link>
        )}
      </div>
      <button
        type="button"
        className="min-h-touch self-start text-body text-ink-emphasis underline"
        onClick={onEdit}
        aria-label={`Details for ${row.displayName}`}
      >
        Details
      </button>
    </li>
  );
}
