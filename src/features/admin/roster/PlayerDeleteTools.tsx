import { useState } from 'react';
import { parseReason } from '@shared/paperEntry';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { friendlyError } from '../../../lib/errors';
import { useDeletePlayer, usePlayerDeleteCheck } from './playerDeleteData';
import type { RosterPlayer } from './roster';

export interface PlayerDeleteToolsProps {
  player: RosterPlayer;
  onDone: (message: string) => void;
}

/**
 * Delete a player for good (D-094). It only works for someone who changes nothing anyone has seen:
 * no weeks played, no login. For everyone else it explains why and points to Inactive or a merge,
 * so the answer comes before the question. Asks for a reason, which goes in the audit log.
 */
export function PlayerDeleteTools({ player, onDone }: PlayerDeleteToolsProps) {
  const [opened, setOpened] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const check = usePlayerDeleteCheck(player.playerId, opened);
  const remove = useDeletePlayer();

  // Awaited rather than passed as a per-call callback: deleting takes this player off the roster, so
  // this form is gone before a callback tied to it could run.
  async function onDelete() {
    const parsed = parseReason(reason, 'deleting this player');
    if (!parsed.ok) {
      setReasonError(parsed.message);
      return;
    }
    setError(null);
    try {
      await remove.mutateAsync({ playerId: player.playerId, reason: parsed.value });
      onDone(`${player.displayName} deleted`);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <details
      className="border-t border-line-subtle pt-3"
      onToggle={(e) => setOpened(e.currentTarget.open)}
    >
      <summary className="min-h-touch cursor-pointer py-2 text-body font-semibold">
        Added by mistake? Delete this player
      </summary>
      <div className="flex flex-col gap-3 pt-1">
        {check.isPending ? (
          <p role="status" className="text-body">
            Checking…
          </p>
        ) : check.isError ? (
          <p role="alert" className="font-semibold text-ink-urgent">
            <span aria-hidden="true">⚠ </span>
            {friendlyError(check.error)}
          </p>
        ) : !check.data.ok ? (
          <p className="rounded-md bg-gold-50 p-3 text-body text-gold-800">
            <span aria-hidden="true">ⓘ </span>
            {check.data.message}
          </p>
        ) : confirming ? (
          <div className="flex flex-col gap-3 rounded-md bg-gold-50 p-3">
            <p className="text-body text-gold-800">
              <span aria-hidden="true">ⓘ </span>
              <strong>This can't be undone.</strong> {player.displayName} is removed for good. They
              have no weeks played, so no results change.
            </p>
            <Field
              label="Why are you deleting them?"
              hint="Saved in the audit log. For example: added by mistake."
              autoComplete="off"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError(null);
                setError(null);
              }}
              error={reasonError ?? undefined}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" disabled={remove.isPending} onClick={onDelete}>
                {remove.isPending ? 'Deleting…' : `Delete ${player.displayName}`}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Keep them
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-body">
              {player.displayName} has no weeks played and no login, so they can be deleted. For
              someone who left the pool, untick "Still playing" instead.
            </p>
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Delete {player.displayName}…
            </Button>
          </>
        )}
        {error && (
          <p role="alert" className="font-semibold text-ink-urgent">
            <span aria-hidden="true">⚠ </span>
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
