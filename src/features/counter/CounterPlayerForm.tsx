import { useState, type FormEvent } from 'react';
import { DUPLICATE_REASON_TEXT } from '@shared/duplicates';
import type { CounterPlayerMatch, CounterRow } from '@shared/adminTypes';
import type { PaymentMethod } from '@shared/types';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { SegmentedChoice } from '../../components/ui/SegmentedChoice';
import { friendlyError } from '../../lib/errors';
import { useCounterSavePlayer } from './counterData';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'etransfer', label: 'e-Transfer' },
];

export interface CounterPlayerFormProps {
  /** The player being fixed, or null to add one. */
  player: CounterRow | null;
  /** What was typed in the search box, as a head start on the name. */
  startName?: string;
  onDone: (message: string) => void;
  onCancel: () => void;
}

/**
 * Add a walk-in, or fix a name. Only a name is needed. The counter can't see a saved phone number,
 * so a blank phone means "keep the one on file", and a possible double asks first.
 */
export function CounterPlayerForm({
  player,
  startName = '',
  onDone,
  onCancel,
}: CounterPlayerFormProps) {
  const [name, setName] = useState(player?.displayName ?? startName);
  const [phone, setPhone] = useState('');
  const [usualPayment, setUsualPayment] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<CounterPlayerMatch[] | null>(null);
  const save = useCounterSavePlayer();

  async function submit(force: boolean) {
    setError(null);
    try {
      const result = await save.mutateAsync({
        playerId: player?.playerId ?? null,
        displayName: name,
        phone,
        usualPayment,
        ...(force ? { force: true } : {}),
      });
      if (!result.saved) {
        setMatches(result.matches);
        return;
      }
      onDone(result.created ? `${name.trim()} added to the roster` : `${name.trim()} saved`);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(false);
  }

  if (matches) {
    return (
      <div className="flex flex-col gap-3 rounded-md border-2 border-line-strong bg-surface p-4">
        <p className="rounded-md bg-gold-50 p-3 text-body text-gold-800">
          <span aria-hidden="true">ⓘ </span>
          <strong>Check:</strong>{' '}
          {matches
            .map(
              (m) =>
                `${m.displayName} is already on the roster (${m.reasons
                  .map((r) => DUPLICATE_REASON_TEXT[r].toLowerCase())
                  .join(', ')})`,
            )
            .join('. ')}
          . Is {name.trim()} a different person?
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={save.isPending} onClick={() => submit(true)}>
            {save.isPending ? 'Saving…' : 'Yes, add them'}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            No, that's them
          </Button>
        </div>
        {error && (
          <p role="alert" className="font-semibold text-ink-urgent">
            <span aria-hidden="true">⚠ </span>
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={player ? `Fix ${player.displayName}` : 'Add a player'}
      className="flex flex-col gap-4 rounded-md border-2 border-line-strong bg-surface p-4"
    >
      <h2 className="font-heading text-h3">{player ? 'Fix a detail' : 'Add a player'}</h2>
      <Field
        label="Name"
        hint="How it shows on the leaderboard. First name and last initial is fine, like Rosalie M."
        autoComplete="off"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Field
        label={player ? 'New phone number (optional)' : 'Phone (optional)'}
        hint={
          player
            ? 'Leave this blank to keep the number on file. Only the commissioner sees phone numbers.'
            : 'Only the commissioner sees it. Any Canadian or U.S. number.'
        }
        type="tel"
        inputMode="tel"
        autoComplete="off"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <SegmentedChoice
        legend="How they usually pay (optional)"
        options={METHODS}
        value={usualPayment}
        onChange={setUsualPayment}
      />
      {error && (
        <p role="alert" className="font-semibold text-ink-urgent">
          <span aria-hidden="true">⚠ </span>
          {error}
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
    </form>
  );
}
