import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { WeekStatus } from '@shared/types';
import {
  addDays,
  daysBetween,
  formatPoolDate,
  formatPoolDateTime,
  toZonedParts,
  zonedTimeToUtc,
} from '@shared/time';
import {
  DEFAULT_ENTRY_FEE_CENTS,
  DEFAULT_LOCK,
  MNF_GAME_ID,
  gamesToText,
  kickoffLabel,
  parseMatchups,
  sundayOf,
  weekIdFor,
  weekProblems,
} from '@shared/weeks';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { GameCard } from '../../../components/ui/GameCard';
import { Panel } from '../../../components/ui/Panel';
import { SectionBar } from '../../../components/ui/SectionBar';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { TextAreaField } from '../../../components/ui/TextAreaField';
import { friendlyError } from '../../../lib/errors';
import { currentSeason, upcomingSunday } from '../../../lib/season';
import {
  useSaveDraftWeek,
  useSeasonWeeks,
  useSetWeekStatus,
  useWeek,
  type WeekView,
} from './weekData';

const PASTE_HINT =
  'One game per line in sheet order, like "Sun 9:30 AM Jaguars at Rams (London)". ' +
  'No day or time means Sunday 1:00 PM. The last line is the Monday night game (8:15 PM unless you say otherwise).';

interface FormState {
  weekNumber: string;
  sunday: string;
  text: string;
  lockDate: string;
  lockTime: string; // "23:59"
}

function lockFields(lockAtMs: number) {
  const { isoDate, hour, minute } = toZonedParts(new Date(lockAtMs));
  return {
    lockDate: isoDate,
    lockTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

function defaultLockFields(sunday: string) {
  return {
    lockDate: addDays(sunday, -DEFAULT_LOCK.daysBeforeSunday),
    lockTime: `${DEFAULT_LOCK.hour}:${String(DEFAULT_LOCK.minute).padStart(2, '0')}`,
  };
}

function formFromWeek(week: WeekView): FormState {
  const sunday = sundayOf(week.games) ?? addDays(toZonedParts(new Date(week.lockAtMs)).isoDate, 1);
  return {
    weekNumber: String(week.weekNumber),
    sunday,
    text: gamesToText(week.games),
    ...lockFields(week.lockAtMs),
  };
}

function newForm(previous: WeekView | undefined): FormState {
  const prevSunday = previous ? sundayOf(previous.games) : null;
  const sunday = prevSunday ? addDays(prevSunday, 7) : upcomingSunday();
  return {
    weekNumber: String((previous?.weekNumber ?? 0) + 1),
    sunday,
    text: '',
    ...defaultLockFields(sunday),
  };
}

/** Clone from the previous week: the same games and times as a starting point, and the same lock rule. */
function cloneFrom(
  previous: WeekView,
  sunday: string,
): Pick<FormState, 'text' | 'lockDate' | 'lockTime'> {
  const prevSunday = sundayOf(previous.games);
  const prevLock = lockFields(previous.lockAtMs);
  const offset = prevSunday
    ? daysBetween(prevSunday, prevLock.lockDate)
    : -DEFAULT_LOCK.daysBeforeSunday;
  return {
    text: gamesToText(previous.games),
    lockDate: addDays(sunday, offset),
    lockTime: prevLock.lockTime,
  };
}

type Message = { tone: 'ok' | 'error'; text: string } | null;

export default function WeekEditorPage() {
  const { year = '', weekId } = useParams();
  // Held here so it survives the editor remounting after a save or a status change.
  const [message, setMessage] = useState<Message>(null);
  const isNew = weekId === 'new';
  const weeks = useSeasonWeeks(year);
  const week = useWeek(year, isNew ? undefined : weekId);

  if (weeks.isPending || (!isNew && week.isPending)) return <p role="status">Loading…</p>;
  if (weeks.isError || week.isError) {
    return (
      <p role="alert" className="font-semibold text-ink-urgent">
        This week didn't load. Check your connection and refresh.
      </p>
    );
  }
  if (!isNew && !week.data) return <p>That week doesn't exist.</p>;

  const previous = [...(weeks.data ?? [])]
    .filter((w) => isNew || w.weekNumber < week.data!.weekNumber)
    .sort((a, b) => b.weekNumber - a.weekNumber)[0];

  // Keyed on the saved content, so the form resets to what was saved (in its tidy, normalized form)
  // after every save or status change.
  const saved = week.data;
  const key =
    isNew || !saved
      ? 'new'
      : `${saved.id}:${saved.status}:${saved.lockAtMs}:${gamesToText(saved.games)}`;
  return (
    <WeekEditor
      key={key}
      year={year}
      week={isNew ? null : saved!}
      previous={previous}
      message={message}
      setMessage={setMessage}
    />
  );
}

interface WeekEditorProps {
  year: string;
  week: WeekView | null;
  previous?: WeekView;
  message: Message;
  setMessage: (message: Message) => void;
}

function WeekEditor({ year, week, previous, message, setMessage }: WeekEditorProps) {
  const navigate = useNavigate();
  const save = useSaveDraftWeek();
  const setStatus = useSetWeekStatus();
  const status: WeekStatus = week?.status ?? 'draft';
  const editable = status === 'draft';

  const initial = useMemo(() => (week ? formFromWeek(week) : newForm(previous)), [week, previous]);
  const [form, setForm] = useState<FormState>(initial);
  const [lockTouched, setLockTouched] = useState(Boolean(week));
  const [preview, setPreview] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);

  const weekNumber = Number(form.weekNumber);
  const weekNumberError =
    Number.isInteger(weekNumber) && weekNumber >= 1 && weekNumber <= 22
      ? undefined
      : 'Use a week number from 1 to 22.';
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(form.sunday);
  const { games, problems: lineProblems } = useMemo(
    () => (dateValid ? parseMatchups(form.text, form.sunday) : { games: [], problems: [] }),
    [form.text, form.sunday, dateValid],
  );
  const [lockHour, lockMinute] = form.lockTime.split(':').map(Number);
  const lockValid =
    /^\d{4}-\d{2}-\d{2}$/.test(form.lockDate) &&
    Number.isInteger(lockHour) &&
    Number.isInteger(lockMinute);
  const lockAtMs = lockValid ? zonedTimeToUtc(form.lockDate, lockHour, lockMinute).getTime() : NaN;
  const readiness = lockValid
    ? weekProblems({ games, lockAtMs, mnfGameId: MNF_GAME_ID }, Date.now())
    : [];
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const sundayError =
    dateValid && lineProblems.some((p) => p.line === 0)
      ? 'Pick the Sunday of this week.'
      : undefined;
  const canSave =
    editable &&
    !weekNumberError &&
    dateValid &&
    !sundayError &&
    lockValid &&
    lineProblems.length === 0;

  function update(patch: Partial<FormState>) {
    setMessage(null);
    setForm((f) => {
      const next = { ...f, ...patch };
      if (patch.sunday && !lockTouched && /^\d{4}-\d{2}-\d{2}$/.test(patch.sunday)) {
        Object.assign(next, defaultLockFields(patch.sunday));
      }
      return next;
    });
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    const id = week?.id ?? weekIdFor(weekNumber);
    try {
      await save.mutateAsync({
        year,
        weekId: id,
        weekNumber,
        games,
        lockAtMs,
        entryFeeCents: previous?.entryFeeCents ?? DEFAULT_ENTRY_FEE_CENTS,
        isNew: !week,
      });
      setMessage({ tone: 'ok', text: 'Draft saved.' });
      if (!week) navigate(`/admin/weeks/${year}/${id}`, { replace: true });
    } catch (err) {
      setMessage({ tone: 'error', text: friendlyError(err) });
    }
  }

  async function changeStatus(to: WeekStatus, done: string) {
    if (!week) return;
    setConfirmLock(false);
    try {
      await setStatus.mutateAsync({ year, weekId: week.id, status: to });
      setMessage({ tone: 'ok', text: done });
    } catch (err) {
      setMessage({ tone: 'error', text: friendlyError(err) });
    }
  }

  const sundayGames = games.filter((g) => g.slot === 'sunday');
  const mnfGame = games.find((g) => g.slot === 'mnf');
  const busy = save.isPending || setStatus.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to={
            year === currentSeason()
              ? '/admin/weeks'
              : `/admin/weeks?season=${encodeURIComponent(year)}`
          }
          className="min-h-touch py-3 text-body underline"
        >
          All weeks
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-h2">
          {week ? `Week ${week.weekNumber}` : 'Set up a new week'}
        </h1>
        <StatusBadge status={status} />
      </div>

      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={
            message.tone === 'error'
              ? 'font-semibold text-ink-urgent'
              : 'font-semibold text-ink-emphasis'
          }
        >
          {message.tone === 'error' ? (
            <span aria-hidden="true">⚠ </span>
          ) : (
            <span aria-hidden="true">✓ </span>
          )}
          {message.text}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={onSave} noValidate className="flex flex-col gap-4">
          {!editable && (
            <p className="rounded-md bg-surface-tint p-3 text-body">
              This week is {status}, so the games and lock time can't change.
              {status === 'open' && ' Put it back to draft first (only while nobody has entered).'}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Week number"
              inputMode="numeric"
              value={form.weekNumber}
              onChange={(e) => update({ weekNumber: e.target.value })}
              error={weekNumberError}
              disabled={!editable || Boolean(week)}
            />
            <Field
              label="Sunday"
              type="date"
              value={form.sunday}
              onChange={(e) => update({ sunday: e.target.value })}
              error={sundayError}
              disabled={!editable}
            />
          </div>

          {editable && previous && previous.games.length > 0 && (
            <Button
              variant="ghost"
              onClick={() => {
                update(cloneFrom(previous, form.sunday));
                setLockTouched(true);
              }}
            >
              Copy games and lock from week {previous.weekNumber}
            </Button>
          )}

          <TextAreaField
            label="Matchups"
            hint={PASTE_HINT}
            rows={16}
            value={form.text}
            onChange={(e) => update({ text: e.target.value })}
            disabled={!editable}
            spellCheck={false}
          />
          {lineProblems.filter((p) => p.line > 0).length > 0 && (
            <ul
              role="alert"
              className="flex flex-col gap-1 text-body-sm font-semibold text-ink-urgent"
            >
              {lineProblems
                .filter((p) => p.line > 0)
                .map((p) => (
                  <li key={`${p.line}-${p.message}`}>
                    <span aria-hidden="true">⚠ </span>Line {p.line}: {p.message}
                  </li>
                ))}
            </ul>
          )}

          <fieldset className="flex flex-col gap-2" disabled={!editable}>
            <legend className="field-label mb-1">Picks lock (Toronto time)</legend>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Lock date"
                type="date"
                value={form.lockDate}
                onChange={(e) => {
                  setLockTouched(true);
                  update({ lockDate: e.target.value });
                }}
              />
              <Field
                label="Lock time"
                type="time"
                value={form.lockTime}
                onChange={(e) => {
                  setLockTouched(true);
                  update({ lockTime: e.target.value });
                }}
              />
            </div>
            {lockValid && (
              <p className="text-body-sm text-ink-muted">
                Locks {formatPoolDateTime(new Date(lockAtMs))}
              </p>
            )}
          </fieldset>

          {editable && (
            <Button
              type="submit"
              variant="primary"
              disabled={!canSave || busy || (Boolean(week) && !dirty)}
            >
              {save.isPending ? 'Saving…' : week && !dirty ? 'Draft saved' : 'Save draft'}
            </Button>
          )}
        </form>

        <div className="flex flex-col gap-4">
          <Panel title="Ready to open?">
            {games.length === 0 ? (
              <p className="text-body">Paste the matchups to check the week.</p>
            ) : readiness.length === 0 ? (
              <p className="text-body">
                <span aria-hidden="true">✓ </span>
                {sundayGames.length} Sunday games and the Monday night game. The lock is before the
                first kickoff.
              </p>
            ) : (
              <ul className="flex flex-col gap-1 text-body">
                {readiness.map((r) => (
                  <li key={r}>
                    <span aria-hidden="true">• </span>
                    {r}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex flex-col gap-3">
              {status === 'draft' && week && (
                <>
                  <Button
                    variant="secondary"
                    disabled={busy || dirty || readiness.length > 0}
                    onClick={() =>
                      changeStatus('open', 'Week opened. Players can make their picks.')
                    }
                  >
                    {setStatus.isPending ? 'Opening…' : 'Open week'}
                  </Button>
                  {dirty && (
                    <p className="text-body-sm text-ink-muted">Save your changes before opening.</p>
                  )}
                </>
              )}
              {status === 'draft' && !week && (
                <p className="text-body-sm text-ink-muted">
                  Save the draft, then open it from here.
                </p>
              )}
              {status === 'open' && week && (
                <>
                  {week.entryCount === 0 && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        changeStatus('draft', 'Back to draft. Players can no longer see this week.')
                      }
                    >
                      Back to draft
                    </Button>
                  )}
                  {!confirmLock ? (
                    <Button variant="ghost" disabled={busy} onClick={() => setConfirmLock(true)}>
                      Lock now
                    </Button>
                  ) : (
                    <div
                      role="group"
                      aria-label="Confirm early lock"
                      className="flex flex-col gap-2"
                    >
                      <p className="text-body">
                        Lock picks now, before {formatPoolDateTime(new Date(week.lockAtMs))}?
                        Everyone's picks are shown, and this can't be undone.
                      </p>
                      <Button
                        variant="secondary"
                        onClick={() => changeStatus('locked', 'Picks are locked.')}
                      >
                        Yes, lock picks now
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirmLock(false)}>
                        Keep it open
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </Panel>

          <Button variant="ghost" onClick={() => setPreview((p) => !p)} aria-expanded={preview}>
            {preview ? 'Hide player preview' : 'Preview as a player'}
          </Button>

          {preview && (
            <section
              aria-label="Player preview"
              className="bg-gameday flex flex-col gap-4 rounded-lg p-4"
            >
              <p className="text-center font-heading text-h3 italic text-ink-inverse">
                Week {form.weekNumber}
                {dateValid ? ` · ${formatPoolDate(form.sunday)}` : ''}
              </p>
              {lockValid && (
                <p className="text-center text-body text-ink-inverse">
                  $
                  {(
                    (previous?.entryFeeCents ?? week?.entryFeeCents ?? DEFAULT_ENTRY_FEE_CENTS) /
                    100
                  ).toFixed(0)}{' '}
                  · Picks lock {formatPoolDateTime(new Date(lockAtMs))}
                </p>
              )}
              <div className="panel">
                <SectionBar>Sunday games</SectionBar>
                <ol className="flex flex-col gap-2 p-2">
                  {sundayGames.map((g) => (
                    <GameCard
                      key={g.id}
                      away={g.away}
                      home={g.home}
                      kickoffLabel={kickoffLabel(g)}
                      venueNote={g.venueNote}
                    />
                  ))}
                </ol>
              </div>
              {mnfGame && (
                <div className="panel">
                  <SectionBar>Monday night</SectionBar>
                  <ol className="flex flex-col gap-2 p-2">
                    <GameCard
                      away={mnfGame.away}
                      home={mnfGame.home}
                      kickoffLabel={kickoffLabel(mnfGame)}
                      venueNote={mnfGame.venueNote}
                    />
                  </ol>
                  <p className="px-4 pb-4 text-body">
                    Tiebreaker: guess the total points scored in this game.
                  </p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
