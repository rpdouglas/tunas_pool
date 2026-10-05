import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { friendlyError } from '../../../lib/errors';
import { useMergePlayers, useUnlinkClaim } from '../claims/claimsData';
import type { RosterPlayer } from './roster';

export interface PlayerLinkToolsProps {
  player: RosterPlayer;
  roster: RosterPlayer[];
  onDone: (message: string) => void;
}

/**
 * The two rare jobs on a roster player (PROJECT_PLAN Sprint 5): unlink a login that was approved
 * by mistake, and merge a double into the profile that should be kept. Each asks once more before
 * it runs, and says plainly when it can't be undone.
 */
export function PlayerLinkTools({ player, roster, onDone }: PlayerLinkToolsProps) {
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [intoId, setIntoId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const unlink = useUnlinkClaim();
  const merge = useMergePlayers();

  const targets = roster
    .filter((p) => p.playerId !== player.playerId)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const into = targets.find((p) => p.playerId === intoId) ?? null;
  const canUnlink = player.claimed && player.origin === 'admin';

  // Awaited rather than passed as per-call callbacks: a merge takes this player off the roster, so
  // this form is gone before a callback tied to it could run.
  async function onUnlink() {
    setError(null);
    try {
      await unlink.mutateAsync({ playerId: player.playerId });
      onDone(`${player.displayName} unlinked`);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function onMerge(target: RosterPlayer) {
    setError(null);
    try {
      const result = await merge.mutateAsync({ fromId: player.playerId, intoId: target.playerId });
      const moved = result.movedWeeks.length;
      onDone(
        `${player.displayName} merged into ${target.displayName} (${moved} ${moved === 1 ? 'week' : 'weeks'} moved)`,
      );
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line-subtle pt-3">
      <p className="text-body">
        {player.claimed
          ? player.origin === 'admin'
            ? 'Linked to a login: this player sees their history and makes their own picks.'
            : 'Made by the player on the website, with their own login.'
          : 'Not linked to a login. The pool enters their picks.'}
      </p>

      {canUnlink &&
        (confirmUnlink ? (
          <div className="flex flex-col gap-2 rounded-md bg-gold-50 p-3">
            <p className="text-body text-gold-800">
              Unlink {player.displayName} from their login? Whoever was linked will no longer see
              this history or change these picks. The entries stay.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" disabled={unlink.isPending} onClick={onUnlink}>
                {unlink.isPending ? 'Unlinking…' : 'Yes, unlink'}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmUnlink(false)}>
                Keep the link
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmUnlink(true)}>
            Unlink login
          </Button>
        ))}

      {targets.length > 0 && (
        <details>
          <summary className="min-h-touch cursor-pointer py-2 text-body font-semibold">
            Same person as another player? Merge them
          </summary>
          <div className="flex flex-col gap-3 pt-1">
            <p className="text-body">
              Moves every week {player.displayName} has played to the player you choose, and retires{' '}
              {player.displayName}. Use it when one person ended up on the roster twice.
            </p>
            <label className="field-label" htmlFor={`merge-into-${player.playerId}`}>
              Keep this player
            </label>
            <select
              id={`merge-into-${player.playerId}`}
              className="field"
              value={intoId}
              onChange={(e) => {
                setError(null);
                setIntoId(e.target.value);
              }}
            >
              <option value="">Choose a player</option>
              {targets.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.displayName}
                  {p.active ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
            {into && (
              <>
                <p className="rounded-md bg-gold-50 p-3 text-body text-gold-800">
                  <span aria-hidden="true">ⓘ </span>
                  <strong>This can't be undone.</strong> {player.displayName}'s weeks will show
                  under {into.displayName}.
                </p>
                <Button
                  variant="secondary"
                  disabled={merge.isPending}
                  onClick={() => onMerge(into)}
                >
                  {merge.isPending
                    ? 'Merging…'
                    : `Merge ${player.displayName} into ${into.displayName}`}
                </Button>
              </>
            )}
          </div>
        </details>
      )}

      {error && (
        <p role="alert" className="font-semibold text-ink-urgent">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
    </div>
  );
}
