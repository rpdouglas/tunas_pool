import { useState } from 'react';
import { ROLE_CHOICES, ROLE_LABELS, type RoleChoice } from '@shared/roles';
import { Button } from '../../../components/ui/Button';
import { friendlyError } from '../../../lib/errors';
import type { RosterPlayer } from './roster';
import { useSetStaffRole } from './staffRolesData';

export interface PlayerRoleToolsProps {
  player: RosterPlayer;
  /** The player's role now: undefined while it loads, null when it couldn't be checked. */
  role: RoleChoice | undefined | null;
  onDone: (message: string) => void;
  /** A role already chosen, waiting for the second tap. For the styleguide. */
  startChoice?: RoleChoice;
}

/** What each role can do, said before it is given (D-140, D-095). */
const ROLE_WARNINGS: Record<RoleChoice, (name: string) => string> = {
  admin: (name) =>
    `${name} will be able to do everything you can: payments, results, the winner, claims, merges, deleting players, and every phone number and email. Only for someone you trust with the pool's money.`,
  counter: (name) =>
    `${name} will be able to enter a new sheet while the week is open, mark cash received, and add or fix a roster player. They can't see phone numbers, emails, notes, or anyone's picks.`,
  none: (name) => `${name} goes back to being a player, with no staff screens.`,
};

const DONE: Record<RoleChoice, (name: string) => string> = {
  admin: (name) => `${name} is now an admin`,
  counter: (name) => `${name} now has the counter role`,
  none: (name) => `${name} is a player again`,
};

/**
 * Give a linked player the counter role or admin, or take it away (D-140). The server sets the
 * claim and writes the audit log; this only asks, says what the role allows, and asks once more.
 */
export function PlayerRoleTools({ player, role, onDone, startChoice }: PlayerRoleToolsProps) {
  const [choice, setChoice] = useState<RoleChoice | ''>(startChoice ?? '');
  const [error, setError] = useState<string | null>(null);
  const setRole = useSetStaffRole();
  const id = `role-${player.playerId}`;

  if (!player.claimed) {
    return (
      <p className="border-t border-line-subtle pt-3 text-body text-ink-muted">
        A staff role needs a login. Once {player.displayName} links their profile, you can make them
        a counter or an admin here.
      </p>
    );
  }

  const current = role ?? 'none';
  const next = choice && choice !== current ? choice : null;

  async function onConfirm(to: RoleChoice) {
    setError(null);
    try {
      await setRole.mutateAsync({ playerId: player.playerId, role: to });
      setChoice('');
      onDone(
        `${DONE[to](player.displayName)}. It shows for them after they tap Check again, or sign out and back in.`,
      );
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line-subtle pt-3">
      <label className="field-label" htmlFor={id}>
        Staff role
      </label>
      <select
        id={id}
        className="field"
        value={choice || current}
        disabled={role == null || setRole.isPending}
        onChange={(e) => {
          setError(null);
          setChoice(e.target.value as RoleChoice);
        }}
      >
        {ROLE_CHOICES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
            {r === current ? ' (now)' : ''}
          </option>
        ))}
      </select>
      {role === undefined && (
        <p role="status" className="text-body">
          Checking their role…
        </p>
      )}
      {role === null && (
        <p role="alert" className="font-semibold text-ink-urgent">
          <span aria-hidden="true">⚠ </span>
          Couldn't check their role. Refresh the page to try again.
        </p>
      )}
      {next && (
        <div className="flex flex-col gap-2 rounded-md bg-gold-50 p-3">
          <p className="text-body text-gold-800">
            <span aria-hidden="true">ⓘ </span>
            {ROLE_WARNINGS[next](player.displayName)}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              disabled={setRole.isPending}
              onClick={() => onConfirm(next)}
            >
              {setRole.isPending
                ? 'Saving…'
                : next === 'none'
                  ? 'Take the role away'
                  : `Make them ${next === 'admin' ? 'an admin' : 'a counter'}`}
            </Button>
            <Button variant="ghost" onClick={() => setChoice('')}>
              Leave as {ROLE_LABELS[current]}
            </Button>
          </div>
        </div>
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
