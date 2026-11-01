/**
 * Reopen picks on a locked week (D-145): a new lock time and a reason, then a second tap. The
 * server decides whether the time works (CLAUDE.md §4.4); the same checks run here first so the
 * commissioner sees the problem before tapping.
 */
import { useState } from 'react';
import { formatPoolDateTime, toZonedParts, zonedTimeToUtc } from '@shared/time';
import { MAX_REASON_LENGTH, MIN_REASON_LENGTH } from '@shared/paperEntry';
import { weekProblems } from '@shared/weeks';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { Panel } from '../../../components/ui/Panel';
import { friendlyError } from '../../../lib/errors';
import { useReopenWeek, type WeekView } from './weekData';

const pad = (n: number) => String(n).padStart(2, '0');

/** The next whole hour, Toronto time: only a starting point, which the commissioner changes. */
function defaultLock(nowMs: number) {
  const HOUR = 60 * 60 * 1000;
  // An hour from now with the minutes dropped, so it is always ahead of now.
  const { isoDate, hour } = toZonedParts(new Date(nowMs + HOUR));
  return { date: isoDate, time: `${pad(hour)}:00` };
}

export function ReopenPicks({
  week,
  onDone,
  startOpen = false,
}: {
  week: WeekView;
  onDone: (message: { tone: 'ok' | 'error'; text: string }) => void;
  /** Show the form straight away (the styleguide's open state). */
  startOpen?: boolean;
}) {
  const reopen = useReopenWeek();
  const [showForm, setShowForm] = useState(startOpen);
  const [confirm, setConfirm] = useState(false);
  const [lock, setLock] = useState(() => defaultLock(Date.now()));
  const [reason, setReason] = useState('');

  const [hour, minute] = lock.time.split(':').map(Number);
  const lockValid =
    /^\d{4}-\d{2}-\d{2}$/.test(lock.date) && Number.isInteger(hour) && Number.isInteger(minute);
  const lockAtMs = lockValid ? zonedTimeToUtc(lock.date, hour, minute).getTime() : NaN;
  const problems = lockValid
    ? weekProblems({ games: week.games, lockAtMs, mnfGameId: week.mnfGameId }, Date.now())
    : ['Pick a new lock date and time.'];
  const trimmed = reason.trim();
  const reasonError =
    trimmed.length > MAX_REASON_LENGTH
      ? `Keep the reason under ${MAX_REASON_LENGTH} characters.`
      : undefined;
  const ready = problems.length === 0 && trimmed.length >= MIN_REASON_LENGTH && !reasonError;

  async function onReopen() {
    try {
      await reopen.mutateAsync({ year: week.year, weekId: week.id, lockAtMs, reason: trimmed });
      onDone({
        tone: 'ok',
        text: `Picks are open again until ${formatPoolDateTime(new Date(lockAtMs))}. Everyone's picks are hidden until then.`,
      });
    } catch (err) {
      setConfirm(false);
      onDone({ tone: 'error', text: friendlyError(err) });
    }
  }

  return (
    <Panel title="Reopen picks">
      <p className="text-body">
        Locked too early? Reopen picks with a new lock time, as long as it's before the first game.
        Everyone's picks are hidden again until the new lock. Anyone who already looked has seen
        them.
      </p>
      {!showForm ? (
        <Button variant="ghost" className="mt-4" onClick={() => setShowForm(true)}>
          Reopen picks
        </Button>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <fieldset className="flex flex-col gap-2" disabled={confirm || reopen.isPending}>
            <legend className="field-label mb-1">New lock (Toronto time)</legend>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Lock date"
                type="date"
                value={lock.date}
                onChange={(e) => setLock((l) => ({ ...l, date: e.target.value }))}
              />
              <Field
                label="Lock time"
                type="time"
                value={lock.time}
                onChange={(e) => setLock((l) => ({ ...l, time: e.target.value }))}
              />
            </div>
            {lockValid && (
              <p className="text-body-sm text-ink-muted">
                Locks {formatPoolDateTime(new Date(lockAtMs))}
              </p>
            )}
            {problems.length > 0 && (
              <ul className="flex flex-col gap-1 text-body-sm font-semibold text-ink-urgent">
                {problems.map((p) => (
                  <li key={p}>
                    <span aria-hidden="true">⚠ </span>
                    {p}
                  </li>
                ))}
              </ul>
            )}
            <Field
              label="Reason"
              hint="Kept in the audit log."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              error={reasonError}
            />
          </fieldset>
          {!confirm ? (
            <>
              <Button variant="secondary" disabled={!ready} onClick={() => setConfirm(true)}>
                Reopen picks
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <div role="group" aria-label="Confirm reopening picks" className="flex flex-col gap-2">
              <p className="text-body">
                Reopen picks until {formatPoolDateTime(new Date(lockAtMs))}? Players can enter and
                change picks until then.
              </p>
              <Button variant="secondary" disabled={reopen.isPending} onClick={onReopen}>
                {reopen.isPending ? 'Reopening…' : 'Yes, reopen picks'}
              </Button>
              <Button variant="ghost" disabled={reopen.isPending} onClick={() => setConfirm(false)}>
                Keep it locked
              </Button>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
