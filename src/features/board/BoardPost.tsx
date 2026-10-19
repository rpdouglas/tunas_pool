import { useState } from 'react';
import { checkMessage, MAX_MESSAGE_LENGTH } from '@shared/board';
import { formatPoolDateTime } from '@shared/time';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { TextAreaField } from '../../components/ui/TextAreaField';
import { friendlyError } from '../../lib/errors';
import type { BoardMessage } from './boardData';

export interface BoardPostProps {
  message: BoardMessage;
  /** Posted by the person looking. */
  mine: boolean;
  /** Their own post, still inside the ten minutes. */
  canChange: boolean;
  /** They can read the board and this post isn't theirs. */
  canReport: boolean;
  /** They reported it already on this visit. */
  reported: boolean;
  /** The commissioner or the counter role: Hide and Mute. */
  staff: boolean;
  /** Reports so far, shown to the staff. */
  reportCount?: number;
  onEdit: (text: string) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  onReport: () => Promise<unknown>;
  onHide: (reason: string) => Promise<unknown>;
  onMute: (reason: string) => Promise<unknown>;
}

type Mode = 'view' | 'edit' | 'delete' | 'hide' | 'mute';

/**
 * One post on the weekly board (D-102): name, when, and the words. The writer can edit or delete
 * it for ten minutes; anyone reading can report it once; the staff can hide it or mute the writer
 * for the week, with a reason that goes in the audit log.
 */
export function BoardPost({
  message,
  mine,
  canChange,
  canReport,
  reported,
  staff,
  reportCount,
  onEdit,
  onDelete,
  onReport,
  onHide,
  onMute,
}: BoardPostProps) {
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState(message.text);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      setMode('view');
      setReason('');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const when = formatPoolDateTime(new Date(message.createdAtMs), { weekday: 'short' });

  return (
    <li className="flex flex-col gap-2 rounded-md border-2 border-line-subtle bg-surface p-3">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-heading text-h3">
          {message.displayName}
          {mine && <span className="badge badge-open ml-2">You</span>}
        </span>
        <span className="text-body-sm text-ink-muted">
          {when}
          {message.edited && !message.hidden && ' · edited'}
        </span>
      </p>

      {message.hidden ? (
        <p className="text-body italic text-ink-muted">Hidden by the pool.</p>
      ) : mode === 'edit' ? (
        <TextAreaField
          label="Edit your post"
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          className="min-h-24"
          onChange={(e) => setDraft(e.target.value)}
        />
      ) : (
        <p className="whitespace-pre-wrap break-words text-body">{message.text}</p>
      )}

      {staff && reportCount ? (
        <p className="text-body-sm font-semibold text-ink-urgent">
          <span aria-hidden="true">⚑ </span>
          Reported {reportCount === 1 ? 'once' : `${reportCount} times`}
        </p>
      ) : null}

      {(mode === 'hide' || mode === 'mute') && (
        <Field
          label={
            mode === 'hide' ? 'Why hide it?' : `Why mute ${message.displayName} for this week?`
          }
          hint="Saved in the audit log. Players only see that the pool hid it."
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
      )}
      {mode === 'delete' && <p className="text-body">Delete this post for good?</p>}

      {error && (
        <p role="alert" className="text-body-sm font-semibold text-ink-urgent">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}

      {!message.hidden && (
        <div className="flex flex-wrap gap-2">
          {mode === 'view' ? (
            <>
              {canChange && (
                <>
                  <Button variant="ghost" className="px-3" onClick={() => setMode('edit')}>
                    Edit
                  </Button>
                  <Button variant="ghost" className="px-3" onClick={() => setMode('delete')}>
                    Delete
                  </Button>
                </>
              )}
              {canReport && !mine && (
                <Button
                  variant="ghost"
                  className="px-3"
                  disabled={busy || reported}
                  onClick={() => run(onReport)}
                >
                  {reported ? 'Reported' : 'Report'}
                </Button>
              )}
              {staff && (
                <>
                  <Button variant="ghost" className="px-3" onClick={() => setMode('hide')}>
                    Hide
                  </Button>
                  {!mine && (
                    <Button variant="ghost" className="px-3" onClick={() => setMode('mute')}>
                      Mute {message.displayName}
                    </Button>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                className="px-3"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    if (mode === 'edit') {
                      const checked = checkMessage(draft);
                      if (!checked.ok) throw new Error(checked.message);
                      return onEdit(checked.text);
                    }
                    if (mode === 'delete') return onDelete();
                    if (reason.trim().length < 5) throw new Error('Type a short reason first.');
                    return mode === 'hide' ? onHide(reason.trim()) : onMute(reason.trim());
                  })
                }
              >
                {busy
                  ? 'Saving…'
                  : mode === 'edit'
                    ? 'Save'
                    : mode === 'delete'
                      ? 'Delete it'
                      : mode === 'hide'
                        ? 'Hide post'
                        : 'Mute'}
              </Button>
              <Button
                variant="ghost"
                className="px-3"
                disabled={busy}
                onClick={() => {
                  setMode('view');
                  setDraft(message.text);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
