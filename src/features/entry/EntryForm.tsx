import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FirebaseError } from 'firebase/app';
import type { PaymentIntent, PaymentMethod, Pick as PickSide } from '@shared/types';
import { normalizePhone, formatPhone } from '@shared/phone';
import { formatPoolDateTime } from '@shared/time';
import { kickoffLabel } from '@shared/weeks';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { CopyField } from '../../components/ui/CopyField';
import { Field } from '../../components/ui/Field';
import { GameCard } from '../../components/ui/GameCard';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { SegmentedChoice } from '../../components/ui/SegmentedChoice';
import type { WeekView } from '../../lib/weekModel';
import {
  clearDraft,
  loadDraft,
  loadRemembered,
  saveDraft,
  saveRemembered,
  type EntryDraft,
} from './draft';
import {
  useSubmitEntry,
  type MyEntry,
  type PublicPoolConfig,
  type SubmitResult,
} from './entryData';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'etransfer', label: 'e-Transfer' },
];
const INTENTS: { value: PaymentIntent; label: string }[] = [
  { value: 'will_do', label: 'Will do' },
  { value: 'already_did', label: 'Already did' },
];

interface Errors {
  tiebreaker?: string;
  displayName?: string;
  phone?: string;
  age?: string;
}

function initialDraft(year: string, week: WeekView, mine: MyEntry): EntryDraft {
  const saved = loadDraft(year, week.id);
  if (saved) return saved;
  if (mine.entry && mine.picks) {
    return {
      picks: mine.picks.picks,
      tiebreaker: String(mine.picks.tiebreakerTotal),
      displayName: mine.entry.displayName,
      phone: mine.profile?.phone ? formatPhone(mine.profile.phone) : '',
      paymentMethod: mine.payment?.paymentMethod ?? null,
      paymentIntent: mine.payment?.paymentIntent ?? 'will_do',
    };
  }
  const me = loadRemembered();
  return {
    picks: {},
    tiebreaker: '',
    displayName: mine.profile?.displayName ?? me?.displayName ?? '',
    phone: mine.profile?.phone ? formatPhone(mine.profile.phone) : (me?.phone ?? ''),
    paymentMethod: mine.profile?.usualPayment ?? me?.paymentMethod ?? null,
    paymentIntent: 'will_do',
  };
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export interface EntryFormProps {
  year: string;
  week: WeekView;
  uid: string;
  mine: MyEntry;
  config: PublicPoolConfig;
  onSubmitted: (result: SubmitResult) => void;
  onCancel?: () => void;
}

/**
 * The four-section entry form (PROJECT_PLAN Sprint 2): picks, tiebreaker, your info and payment,
 * review and submit. Built for Dale's worst case: the last 20 minutes before lock, one thumb.
 */
export function EntryForm({
  year,
  week,
  uid,
  mine,
  config,
  onSubmitted,
  onCancel,
}: EntryFormProps) {
  const [draft, setDraft] = useState<EntryDraft>(() => initialDraft(year, week, mine));
  const [ageChecked, setAgeChecked] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submit = useSubmitEntry();

  const needsAge = !mine.profile?.ageAttestedAt;
  const games = useMemo(() => [...week.games].sort((a, b) => a.order - b.order), [week.games]);
  const sunday = games.filter((g) => g.slot === 'sunday');
  const mnf = games.find((g) => g.slot === 'mnf');
  const picked = games.filter((g) => draft.picks[g.id]).length;
  const left = games.length - picked;
  const fee = `$${(week.entryFeeCents / 100).toFixed(0)}`;
  const lockLabel = formatPoolDateTime(new Date(week.lockAtMs));
  const isEdit = Boolean(mine.entry);

  // Save on the device from the first tap (PERSONAS: Dale).
  useEffect(() => saveDraft(year, week.id, draft), [year, week.id, draft]);

  function update(patch: Partial<EntryDraft>) {
    setSubmitError(null);
    // A fixed field drops its error right away; the rest stay until the next submit.
    setErrors((e) => {
      const next = { ...e };
      for (const key of Object.keys(patch)) delete next[key as keyof Errors];
      return next;
    });
    setDraft((d) => ({ ...d, ...patch }));
  }

  function setPick(gameId: string, pick: PickSide | null) {
    setDraft((d) => {
      const picks = { ...d.picks };
      if (pick) picks[gameId] = pick;
      else delete picks[gameId];
      return { ...d, picks };
    });
  }

  function jumpTo(id: string) {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (el?.querySelector('button, input') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  function nextUnpicked() {
    const next = games.find((g) => !draft.picks[g.id]);
    if (next) jumpTo(`game-${next.id}`);
  }

  function validate(): Errors {
    const e: Errors = {};
    const tb = draft.tiebreaker.trim();
    if (!/^\d{1,3}$/.test(tb) || Number(tb) > 200) {
      e.tiebreaker = 'Enter a whole number from 0 to 200, like 45.';
    }
    if (!draft.displayName.trim())
      e.displayName = 'Enter the name other players will see, like Dale D.';
    else if (draft.displayName.trim().length > 60)
      e.displayName = 'Keep your name under 60 characters.';
    if (draft.phone.trim() && !normalizePhone(draft.phone)) {
      e.phone = 'Enter a 10-digit phone number, like 613-555-0123, or leave it blank.';
    }
    if (needsAge && !ageChecked) e.age = "Confirm you're 18 or older to enter.";
    return e;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (left > 0) {
      nextUnpicked();
      return;
    }
    const found = validate();
    setErrors(found);
    const firstError = (['tiebreaker', 'displayName', 'phone', 'age'] as const).find(
      (k) => found[k],
    );
    if (firstError) {
      jumpTo(`field-${firstError}`);
      return;
    }
    try {
      const result = await submit.mutateAsync({
        year,
        weekId: week.id,
        uid,
        displayName: draft.displayName.trim(),
        phone: draft.phone.trim() ? normalizePhone(draft.phone) : null,
        paymentMethod: draft.paymentMethod,
        paymentIntent: draft.paymentIntent ?? 'will_do',
        picks: Object.fromEntries(games.map((g) => [g.id, draft.picks[g.id]])),
        tiebreakerTotal: Number(draft.tiebreaker.trim()),
        confirmAge: needsAge && ageChecked,
      });
      clearDraft(year, week.id);
      saveRemembered({
        displayName: draft.displayName.trim(),
        phone: draft.phone.trim(),
        paymentMethod: draft.paymentMethod,
      });
      onSubmitted(result);
    } catch (err) {
      const locked = Date.now() >= week.lockAtMs;
      if (err instanceof FirebaseError && err.code === 'permission-denied') {
        setSubmitError(
          locked
            ? `Picks locked at ${lockLabel}. These picks weren't saved.`
            : "The pool didn't accept these picks. Refresh the page and try again.",
        );
      } else {
        setSubmitError(
          "Your picks didn't save. Check your signal and try again. They're still saved on this phone.",
        );
      }
    }
  }

  const submitLabel = submit.isPending
    ? 'Saving…'
    : left > 0
      ? `${plural(left, 'game', 'games')} left`
      : isEdit
        ? 'Save changes'
        : 'Submit picks';

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col">
      <ProgressBar
        done={picked}
        total={games.length}
        onNext={left > 0 ? nextUnpicked : undefined}
      />

      <div className="mx-auto flex w-full max-w-player flex-col gap-6 px-4 pb-16 pt-4">
        <details className="rounded-md bg-surface p-4 text-body">
          <summary className="min-h-touch cursor-pointer py-2 font-heading text-h3">
            How it works
          </summary>
          <ul className="mt-2 flex list-disc flex-col gap-2 pl-5">
            <li>
              Pick the winner of every game: {sunday.length} on Sunday and the Monday night game.
            </li>
            <li>Most correct picks wins the pot. The pot is {fee} for every paid entry.</li>
            <li>
              If players tie, the tiebreaker decides: guess the total points in the Monday night
              game. The closest guess at or over the real total wins. If nobody is at or over, the
              closest guess under it wins.
            </li>
            <li>Example from the sheet: the total is 46. A guess of 58 beats a guess of 45.</li>
            <li>You can change your picks until they lock, {lockLabel}.</li>
          </ul>
        </details>

        {/* 1. Picks */}
        <section aria-labelledby="sec-sunday" className="panel">
          <h2 id="sec-sunday" className="section-bar">
            Sunday games
          </h2>
          <ol className="flex flex-col gap-2 bg-surface-muted p-2">
            {sunday.map((g) => (
              <GameCard
                key={g.id}
                id={`game-${g.id}`}
                away={g.away}
                home={g.home}
                kickoffLabel={kickoffLabel(g)}
                venueNote={g.venueNote}
                pick={draft.picks[g.id] ?? null}
                onPick={(p) => setPick(g.id, p)}
              />
            ))}
          </ol>
        </section>

        {mnf && (
          <section aria-labelledby="sec-mnf" className="panel">
            <h2 id="sec-mnf" className="section-bar">
              Monday night
            </h2>
            <ol className="flex flex-col gap-2 bg-surface-muted p-2">
              <GameCard
                id={`game-${mnf.id}`}
                away={mnf.away}
                home={mnf.home}
                kickoffLabel={kickoffLabel(mnf)}
                venueNote={mnf.venueNote}
                pick={draft.picks[mnf.id] ?? null}
                onPick={(p) => setPick(mnf.id, p)}
              />
            </ol>

            {/* 2. Tiebreaker */}
            <div className="p-4" id="field-tiebreaker">
              <Field
                label="Tiebreaker: total points in this game"
                hint={`Add both teams' scores for ${mnf.away} at ${mnf.home}. The closest guess at or over the real total wins a tie.`}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={3}
                value={draft.tiebreaker}
                onChange={(e) => update({ tiebreaker: e.target.value.replace(/\D/g, '') })}
                error={errors.tiebreaker}
              />
            </div>
          </section>
        )}

        {/* 3. Your info and payment */}
        <section aria-labelledby="sec-you" className="panel">
          <h2 id="sec-you" className="section-bar">
            You and payment
          </h2>
          <div className="flex flex-col gap-5 p-4">
            <div id="field-displayName">
              <Field
                label="Your name"
                hint="Other players see this. First name and last initial is fine, like Dale D., or a nickname."
                autoComplete="nickname"
                value={draft.displayName}
                onChange={(e) => update({ displayName: e.target.value })}
                error={errors.displayName}
              />
            </div>
            <div id="field-phone">
              <Field
                label="Phone (optional)"
                hint="So the pool can reach you about your entry. Other players never see it."
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={draft.phone}
                onChange={(e) => update({ phone: e.target.value })}
                error={errors.phone}
              />
            </div>

            <SegmentedChoice
              legend={`How will you pay the ${fee}?`}
              options={METHODS}
              value={draft.paymentMethod}
              onChange={(paymentMethod) => update({ paymentMethod })}
            />
            {draft.paymentMethod === 'etransfer' && (
              <div className="flex flex-col gap-3 rounded-md bg-surface-tint p-3">
                <p className="text-body">
                  Send {fee} by e-Transfer to the address below.{' '}
                  <strong>Put your name in the message.</strong>
                </p>
                <CopyField label="e-Transfer email" value={config.etransferEmail} />
                {config.etransferInstructions && (
                  <p className="text-body">{config.etransferInstructions}</p>
                )}
              </div>
            )}
            {draft.paymentMethod === 'cash' && (
              <p className="rounded-md bg-surface-tint p-3 text-body">
                Pay {fee} cash at the shop before picks lock.
              </p>
            )}
            {draft.paymentMethod && (
              <SegmentedChoice
                legend="Have you paid yet?"
                options={INTENTS}
                value={draft.paymentIntent}
                onChange={(paymentIntent) => update({ paymentIntent })}
              />
            )}
            {!draft.paymentMethod && (
              <p className="text-body-sm text-ink-muted">
                You can submit your picks now and choose how to pay later.
              </p>
            )}

            {needsAge && (
              <div id="field-age">
                <Checkbox
                  label="I'm 18 or older"
                  checked={ageChecked}
                  onChange={(e) => {
                    setAgeChecked(e.target.checked);
                    setErrors((x) => ({ ...x, age: undefined }));
                  }}
                  error={errors.age}
                />
              </div>
            )}
          </div>
        </section>

        {/* 4. Review and submit */}
        <section aria-labelledby="sec-review" className="panel">
          <h2 id="sec-review" className="section-bar">
            Review and submit
          </h2>
          <div className="flex flex-col gap-4 p-4">
            <ul className="flex flex-col divide-y divide-line-subtle">
              {games.map((g) => {
                const pick = draft.picks[g.id];
                const team = pick === 'away' ? g.away : pick === 'home' ? g.home : null;
                return (
                  <li
                    key={g.id}
                    className="flex min-h-touch items-center justify-between gap-2 py-1"
                  >
                    <span className="text-body">
                      {team ? (
                        <>
                          <strong>{team}</strong>
                          <span className="text-ink-muted">
                            {' '}
                            over {pick === 'away' ? g.home : g.away}
                          </span>
                        </>
                      ) : (
                        <span className="text-ink-urgent">
                          <span aria-hidden="true">○ </span>
                          {g.away} at {g.home}: no pick yet
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="min-h-touch min-w-touch px-2 text-body text-ink-emphasis underline"
                      onClick={() => jumpTo(`game-${g.id}`)}
                      aria-label={`Change your pick for ${g.away} at ${g.home}`}
                    >
                      {team ? 'Change' : 'Pick'}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="text-body">
              <strong>Tiebreaker:</strong> {draft.tiebreaker || 'not entered'}
            </p>

            {submitError && (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-md bg-red-50 p-3 font-semibold text-ink-urgent"
              >
                <p>
                  <span aria-hidden="true">⚠ </span>
                  {submitError}
                </p>
              </div>
            )}

            <Button type="submit" variant="primary" disabled={submit.isPending}>
              {submitLabel}
            </Button>
            {isEdit && onCancel && (
              <Button variant="ghost" onClick={onCancel}>
                Keep my saved picks
              </Button>
            )}
            <p className="text-center text-body-sm text-ink-muted">
              Picks lock {lockLabel}.{' '}
              <Link to="/" className="underline">
                Back to this week
              </Link>
            </p>
          </div>
        </section>
      </div>
    </form>
  );
}
