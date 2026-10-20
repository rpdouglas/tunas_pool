import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { friendlyError } from '../../lib/errors';

export interface MutedPlayer {
  playerId: string;
  displayName: string;
  /** Why they were muted, from the mute itself. */
  reason: string;
}

/**
 * The players muted on this week's board (D-109), for the commissioner and the counter role, each
 * with a Lift mute button. Lifting needs a reason too, which goes in the audit log (`boardMute`).
 */
export function BoardMutes({
  muted,
  onLift,
}: {
  muted: MutedPlayer[];
  onLift: (playerId: string, reason: string) => Promise<unknown>;
}) {
  if (muted.length === 0) return null;
  return (
    <section aria-labelledby="board-muted" className="flex flex-col gap-2">
      <h3 id="board-muted" className="font-heading text-h3">
        Muted this week
      </h3>
      <ul className="flex flex-col gap-2">
        {muted.map((m) => (
          <MutedRow key={m.playerId} player={m} onLift={(reason) => onLift(m.playerId, reason)} />
        ))}
      </ul>
    </section>
  );
}

function MutedRow({
  player,
  onLift,
}: {
  player: MutedPlayer;
  onLift: (reason: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lift() {
    if (reason.trim().length < 5) {
      setError('Type a short reason first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onLift(reason.trim());
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-md border-2 border-line-subtle bg-surface p-3">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-heading text-h3">{player.displayName}</span>
        <span className="text-body-sm text-ink-muted">Muted: {player.reason}</span>
      </p>
      {open && (
        <Field
          label={`Why lift ${player.displayName}'s mute?`}
          hint="Saved in the audit log."
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
      )}
      {error && (
        <p role="alert" className="text-body-sm font-semibold text-ink-urgent">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {open ? (
          <>
            <Button variant="secondary" className="px-3" disabled={busy} onClick={lift}>
              {busy ? 'Saving…' : 'Lift mute'}
            </Button>
            <Button
              variant="ghost"
              className="px-3"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="ghost" className="px-3" onClick={() => setOpen(true)}>
            Lift mute
          </Button>
        )}
      </div>
    </li>
  );
}
