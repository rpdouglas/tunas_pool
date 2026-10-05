import { useState, type FormEvent } from 'react';
import { DUPLICATE_REASON_TEXT } from '@shared/duplicates';
import { formatPhone, normalizePhone } from '@shared/phone';
import type { PaymentMethod } from '@shared/types';
import { Button } from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';
import { Field } from '../../../components/ui/Field';
import { SegmentedChoice } from '../../../components/ui/SegmentedChoice';
import { friendlyError } from '../../../lib/errors';
import {
  possibleMatches,
  validatePlayer,
  type PlayerFormErrors,
  type PlayerFormValues,
  type RosterPlayer,
} from './roster';
import { PlayerDeleteTools } from './PlayerDeleteTools';
import { PlayerLinkTools } from './PlayerLinkTools';
import { useSavePlayer } from './rosterData';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'etransfer', label: 'e-Transfer' },
];

export interface PlayerFormProps {
  /** The player being edited, or null to add one. */
  player: RosterPlayer | null;
  /** Everyone on the roster, to point out a possible double. */
  roster: RosterPlayer[];
  /** What was typed in the search box, as a head start on the name. */
  startName?: string;
  onSaved: (playerId: string, name: string, added: boolean) => void;
  onCancel: () => void;
  /** After an unlink or a merge, with the message to show. Omit to leave those tools out. */
  onLinkChange?: (message: string) => void;
}

/** Add or edit a roster player. Only a name is needed: no email, no account (PERSONAS: Rosalie). */
export function PlayerForm({
  player,
  roster,
  startName = '',
  onSaved,
  onCancel,
  onLinkChange,
}: PlayerFormProps) {
  const [values, setValues] = useState<PlayerFormValues>({
    displayName: player?.displayName ?? startName,
    phone: player?.phone ? formatPhone(player.phone) : '',
    usualPayment: player?.usualPayment ?? null,
    notes: player?.notes ?? '',
  });
  const [active, setActive] = useState(player?.active ?? true);
  const [errors, setErrors] = useState<PlayerFormErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const save = useSavePlayer();

  const matches = values.displayName.trim()
    ? possibleMatches(
        {
          playerId: player?.playerId ?? null,
          displayName: values.displayName,
          phone: normalizePhone(values.phone),
        },
        roster,
      )
    : [];

  function update(patch: Partial<PlayerFormValues>) {
    setSaveError(null);
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[k as keyof PlayerFormErrors];
      return next;
    });
    setValues((v) => ({ ...v, ...patch }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const checked = validatePlayer(values);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    try {
      const playerId = await save.mutateAsync({
        playerId: player?.playerId ?? null,
        fields: checked.fields,
        active: player ? active : undefined,
      });
      onSaved(playerId, checked.fields.displayName, !player);
    } catch (err) {
      setSaveError(friendlyError(err));
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={player ? `Edit ${player.displayName}` : 'Add a player'}
      className="flex flex-col gap-4 rounded-md border-2 border-line-strong bg-surface p-4"
    >
      <h2 className="font-heading text-h3">{player ? 'Player details' : 'Add a player'}</h2>
      <Field
        label="Name"
        hint="How it shows on the leaderboard. First name and last initial is fine, like Rosalie M."
        autoComplete="off"
        value={values.displayName}
        onChange={(e) => update({ displayName: e.target.value })}
        error={errors.displayName}
      />
      <Field
        label="Phone (optional)"
        hint="Only the admin sees it. Any Canadian or U.S. number."
        type="tel"
        inputMode="tel"
        autoComplete="off"
        value={values.phone}
        onChange={(e) => update({ phone: e.target.value })}
        error={errors.phone}
      />
      <SegmentedChoice
        legend="How they usually pay (optional)"
        options={METHODS}
        value={values.usualPayment}
        onChange={(usualPayment) => update({ usualPayment })}
      />
      <Field
        label="Note (optional)"
        hint="Only the admin sees it. For example: large-print sheet, daughter drops it off."
        autoComplete="off"
        value={values.notes}
        onChange={(e) => update({ notes: e.target.value })}
        error={errors.notes}
      />
      {player && (
        <Checkbox
          label="Still playing. Untick to move them to Inactive."
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
      )}

      {matches.map((m) => (
        <p key={m.player.playerId} className="rounded-md bg-gold-50 p-2 text-body text-gold-800">
          <span aria-hidden="true">ⓘ </span>
          <strong>Check:</strong> might be the same person as {m.player.displayName}
          {m.player.active ? '' : ' (inactive)'} (
          {m.reasons.map((r) => DUPLICATE_REASON_TEXT[r].toLowerCase()).join(', ')}).
        </p>
      ))}

      {saveError && (
        <p role="alert" className="font-semibold text-ink-urgent">
          <span aria-hidden="true">⚠ </span>
          {saveError}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : player ? 'Save' : 'Add player'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {player && onLinkChange && (
        <PlayerLinkTools player={player} roster={roster} onDone={onLinkChange} />
      )}
      {player && onLinkChange && <PlayerDeleteTools player={player} onDone={onLinkChange} />}
    </form>
  );
}
