import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { SOURCE_LABELS, blankGames, type AdminEntry } from '@shared/paperEntry';
import { formatPoolDateTime } from '@shared/time';
import type { EntrySource, Pick as PickSide } from '@shared/types';
import { Button } from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';
import { Field } from '../../../components/ui/Field';
import { PhotoField } from '../../../components/ui/PhotoField';
import { PickRow } from '../../../components/ui/PickRow';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { SegmentedChoice } from '../../../components/ui/SegmentedChoice';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { friendlyError } from '../../../lib/errors';
import { paperPhotoUrl, uploadPaperPhoto } from '../../../lib/paperPhotos';
import type { WeekView } from '../../../lib/weekModel';
import {
  loadAdminDraft,
  saveAdminDraft,
  type AdminEntryDraft,
  type PaidChoice,
} from './adminDraft';
import { useDeleteAdminEntry, useSaveAdminEntry, type AdminEntryView } from './adminEntryData';

const PAID_OPTIONS: { value: PaidChoice; label: string }[] = [
  { value: 'none', label: 'Not yet' },
  { value: 'cash', label: 'Paid cash' },
  { value: 'etransfer', label: 'Paid e-Transfer' },
];

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function initialDraft(year: string, week: WeekView, view: AdminEntryView): AdminEntryDraft {
  const saved = loadAdminDraft(year, week.id, view.player!.playerId);
  if (saved) return saved;
  if (view.entry && view.picks) {
    return {
      picks: view.picks.picks,
      tiebreaker: String(view.picks.tiebreakerTotal),
      source: view.entry.source,
      paid: 'none',
      reason: '',
    };
  }
  return { picks: {}, tiebreaker: '', source: 'paper', paid: 'none', reason: '' };
}

export interface PaperEntryFormProps {
  year: string;
  week: WeekView;
  view: AdminEntryView;
  /** True once picks are locked: saving needs a typed reason and leaves a "Late entry" badge. */
  late: boolean;
  /** True for a week set up after it was played: sheets are entered as normal entries (D-071). */
  backfill?: boolean;
  /** Where "Back" goes: the roster, keeping the season and week. */
  backHref: string;
  onSaved: (summary: { name: string; paid: boolean; late: boolean }) => void;
  onRemoved: (name: string) => void;
}

/**
 * Entering picks for someone, in the paper sheet's own order (PROJECT_PLAN Sprint 4). Built for the
 * shop counter: one thumb, 15 taps, the tiebreaker, paid or not, save.
 */
export function PaperEntryForm({
  year,
  week,
  view,
  late,
  backfill = false,
  backHref,
  onSaved,
  onRemoved,
}: PaperEntryFormProps) {
  const player = view.player!;
  const [draft, setDraft] = useState<AdminEntryDraft>(() => initialDraft(year, week, view));
  const [allowBlanks, setAllowBlanks] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [photoHref, setPhotoHref] = useState<string>();
  const [errors, setErrors] = useState<{ tiebreaker?: string; reason?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removeReason, setRemoveReason] = useState('');
  const [removeError, setRemoveError] = useState<string | null>(null);
  const save = useSaveAdminEntry(year, week.id, player.playerId);
  const remove = useDeleteAdminEntry(year, week.id, player.playerId);

  const games = useMemo(() => [...week.games].sort((a, b) => a.order - b.order), [week.games]);
  const blanks = blankGames(games, draft.picks);
  const picked = games.length - blanks.length;
  const fee = `$${(week.entryFeeCents / 100).toFixed(0)}`;
  const lockLabel = formatPoolDateTime(new Date(week.lockAtMs));
  const isEdit = Boolean(view.entry);
  const alreadyPaid = view.payment?.paymentStatus === 'paid';
  const savedPhotoPath = photoRemoved ? null : (view.entry?.paperPhotoPath ?? null);
  const mnf = games.find((g) => g.slot === 'mnf');
  const busy = save.isPending || uploading;

  const sources: { value: EntrySource; label: string }[] = (
    view.entry?.source === 'web'
      ? (['web', 'paper', 'text', 'phone'] as const)
      : (['paper', 'text', 'phone'] as const)
  ).map((value) => ({ value, label: SOURCE_LABELS[value] }));

  useEffect(
    () => saveAdminDraft(year, week.id, player.playerId, draft),
    [year, week.id, player.playerId, draft],
  );

  // The stored photo, if there is one, so "View photo" is a plain link.
  const storedPath = view.entry?.paperPhotoPath ?? null;
  useEffect(() => {
    let current = true;
    if (storedPath) {
      paperPhotoUrl(storedPath)
        .then((url) => current && setPhotoHref(url))
        .catch(() => undefined); // the photo can't be shown right now; the entry still can
    }
    return () => {
      current = false;
    };
  }, [storedPath]);

  function update(patch: Partial<AdminEntryDraft>) {
    setSubmitError(null);
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[k as keyof typeof next];
      return next;
    });
    setDraft((d) => ({ ...d, ...patch }));
  }

  function setPick(gameId: string, pick: PickSide | null) {
    setSubmitError(null);
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

  function nextBlank() {
    if (blanks[0]) jumpTo(`game-${blanks[0].id}`);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (picked === 0 || (blanks.length > 0 && !allowBlanks)) {
      nextBlank();
      return;
    }
    const found: typeof errors = {};
    const tb = draft.tiebreaker.trim();
    if (!/^\d{1,3}$/.test(tb) || Number(tb) > 200) {
      found.tiebreaker = 'Enter a whole number from 0 to 200, like 45.';
    }
    if (late && draft.reason.trim().length < 5) {
      found.reason = 'Type a short reason, like "Sheet was in the drop box Friday".';
    }
    setErrors(found);
    if (found.tiebreaker) return jumpTo('field-tiebreaker');
    if (found.reason) return jumpTo('field-reason');

    let paperPhotoPath = savedPhotoPath;
    if (photoFile) {
      setUploading(true);
      try {
        paperPhotoPath = await uploadPaperPhoto(photoFile, {
          year,
          weekId: week.id,
          playerId: player.playerId,
        });
      } catch {
        setSubmitError(
          "The photo didn't upload, so nothing was saved. Try again, or remove the photo and save the picks without it.",
        );
        return;
      } finally {
        setUploading(false);
      }
    }

    const entry: AdminEntry = {
      source: draft.source,
      picks: Object.fromEntries(
        games.filter((g) => draft.picks[g.id]).map((g) => [g.id, draft.picks[g.id]]),
      ),
      tiebreakerTotal: Number(tb),
      paperPhotoPath,
      markPaid: alreadyPaid || draft.paid === 'none' ? null : draft.paid,
    };
    try {
      const result = await save.mutateAsync({
        entry,
        reason: late ? draft.reason.trim() : undefined,
      });
      saveAdminDraft(year, week.id, player.playerId, null);
      onSaved({ name: player.displayName, paid: result.paid, late: result.late });
    } catch (err) {
      setSubmitError(friendlyError(err));
    }
  }

  async function onRemove() {
    setRemoveError(null);
    if (removeReason.trim().length < 5) {
      setRemoveError('Type a short reason, like "Entered twice by mistake".');
      return;
    }
    try {
      await remove.mutateAsync(removeReason.trim());
      saveAdminDraft(year, week.id, player.playerId, null);
      onRemoved(player.displayName);
    } catch (err) {
      setRemoveError(friendlyError(err));
    }
  }

  const saveLabel = busy
    ? 'Saving…'
    : picked === 0 || (blanks.length > 0 && !allowBlanks)
      ? `${plural(blanks.length, 'game', 'games')} left`
      : late
        ? 'Save late entry'
        : isEdit
          ? 'Save changes'
          : 'Save picks';

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col">
      <div className="mx-auto flex w-full max-w-player flex-col gap-3 pb-3">
        <Link to={backHref} className="inline-flex min-h-touch items-center text-body underline">
          ← Roster
        </Link>
        <h1 className="font-heading text-h2">
          <span className="block text-body font-normal text-ink-muted">Entering for</span>
          {player.displayName}
        </h1>
        <p className="flex flex-wrap items-center gap-2 text-body text-ink-muted">
          <StatusBadge status={week.status === 'open' ? 'open' : 'locked'} />
          Week {week.weekNumber}. Picks {late || backfill ? 'locked' : 'lock'} {lockLabel}.
        </p>
        {isEdit && (
          <p className="text-body">
            {player.displayName} already has picks this week. Saving replaces them.
          </p>
        )}
        {backfill && (
          <p className="rounded-md bg-surface-tint p-3 text-body">
            <span aria-hidden="true">ⓘ </span>
            <strong>This week was backfilled.</strong> Enter the sheet as it was handed in. It saves
            as a normal entry, and the results are already in, so the record shows at once.
          </p>
        )}
        {late && (
          <p className="rounded-md bg-gold-50 p-3 text-body text-gold-800">
            <span aria-hidden="true">ⓘ </span>
            <strong>Picks are locked.</strong> This will be saved as a late entry. It needs a
            reason, which goes in the audit log, and the entry shows a "Late entry" badge.
          </p>
        )}
      </div>

      <ProgressBar
        done={picked}
        total={games.length}
        onNext={blanks.length ? nextBlank : undefined}
      />

      <div className="mx-auto flex w-full max-w-player flex-col gap-6 pb-16 pt-4">
        <SegmentedChoice
          legend="How did the picks come in?"
          options={sources}
          value={draft.source}
          onChange={(source) => update({ source })}
        />

        <section aria-labelledby="sec-sheet" className="flex flex-col gap-3">
          <h2 id="sec-sheet" className="font-heading text-h3">
            The sheet, top to bottom
          </h2>
          <ol className="flex flex-col gap-2">
            {games.map((g) => (
              <PickRow
                key={g.id}
                id={`game-${g.id}`}
                number={g.order}
                away={g.away}
                home={g.home}
                pick={draft.picks[g.id] ?? null}
                onPick={(p) => setPick(g.id, p)}
              />
            ))}
          </ol>
        </section>

        <div id="field-tiebreaker">
          <Field
            label="Tiebreaker: total points Monday night"
            hint={mnf ? `Their guess for ${mnf.away} at ${mnf.home}.` : undefined}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            value={draft.tiebreaker}
            onChange={(e) => update({ tiebreaker: e.target.value.replace(/\D/g, '') })}
            error={errors.tiebreaker}
          />
        </div>

        {alreadyPaid ? (
          <p className="flex flex-wrap items-center gap-2 text-body">
            <StatusBadge status="paid" /> Already marked paid. Undo it on the Payments screen.
          </p>
        ) : (
          <SegmentedChoice
            legend={`Did they pay the ${fee}?`}
            options={PAID_OPTIONS}
            value={draft.paid}
            onChange={(paid) => update({ paid })}
          />
        )}

        {draft.source === 'paper' && (
          <PhotoField
            label="Photo of the sheet (optional)"
            hint="Kept with the entry, so any question is settled by the sheet. Only the admin can see it."
            file={photoFile}
            hasSaved={Boolean(savedPhotoPath)}
            viewHref={photoHref}
            onChoose={(file) => {
              setSubmitError(null);
              setPhotoFile(file);
            }}
            onRemove={() => {
              setSubmitError(null);
              setPhotoFile(null);
              setPhotoRemoved(true);
            }}
          />
        )}

        {late && (
          <div id="field-reason">
            <Field
              label="Why is this entry late?"
              hint="For the record. Other players will see that it was a late entry."
              value={draft.reason}
              maxLength={300}
              onChange={(e) => update({ reason: e.target.value })}
              error={errors.reason}
            />
          </div>
        )}

        {blanks.length > 0 && picked > 0 && (
          <Checkbox
            label={`The sheet left ${plural(blanks.length, 'game', 'games')} blank. Save ${blanks.length === 1 ? 'it' : 'them'} as blank (a blank counts as a miss).`}
            checked={allowBlanks}
            onChange={(e) => setAllowBlanks(e.target.checked)}
          />
        )}

        {submitError && (
          <p role="alert" className="rounded-md bg-red-50 p-3 font-semibold text-ink-urgent">
            <span aria-hidden="true">⚠ </span>
            {submitError}
          </p>
        )}

        <Button type="submit" variant="primary" disabled={busy}>
          {saveLabel}
        </Button>

        {isEdit && (
          <details className="rounded-md border-2 border-line-subtle bg-surface p-3">
            <summary className="min-h-touch cursor-pointer py-2 font-heading text-h3">
              Remove this entry
            </summary>
            {alreadyPaid ? (
              <p className="text-body">
                This entry is marked paid. Undo the payment on the Payments screen first, then
                remove the entry.
              </p>
            ) : (
              <div className="flex flex-col gap-3 pt-2">
                <p className="text-body">
                  Removes {player.displayName}'s picks for week {week.weekNumber}. They stay on the
                  roster. The reason goes in the audit log.
                </p>
                <Field
                  label="Why is it being removed?"
                  value={removeReason}
                  maxLength={300}
                  onChange={(e) => {
                    setRemoveError(null);
                    setRemoveReason(e.target.value);
                  }}
                  error={removeError ?? undefined}
                />
                <Button variant="ghost" disabled={remove.isPending} onClick={onRemove}>
                  {remove.isPending ? 'Removing…' : 'Remove entry'}
                </Button>
              </div>
            )}
          </details>
        )}
      </div>
    </form>
  );
}
