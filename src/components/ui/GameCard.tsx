import { TEAM_INFO, badgeInk } from '@shared/teamColors';
import { resolveTeam } from '@shared/teams';
import type { Pick } from '@shared/types';
import { TeamMark } from './TeamMark';

export interface GameCardProps {
  /** Lets the form jump to this game. */
  id?: string;
  away: string;
  home: string;
  /** "Sun 1:00 PM", already in pool time. */
  kickoffLabel: string;
  venueNote?: string;
  pick?: Pick | null;
  /** Omit for a read-only card (admin preview, locked weeks). */
  onPick?: (pick: Pick | null) => void;
}

/**
 * One game on the sheet: kickoff on top, then away | at | home (DESIGN_SYSTEM §6), each team with
 * its logo above its name (D-106). Tap a team to pick it, tap again to clear: the picked team fills
 * with its colour and keeps the check mark, so the pick is never shown by colour alone. Without
 * `onPick` the card is read-only.
 */
export function GameCard({
  id,
  away,
  home,
  kickoffLabel,
  venueNote,
  pick = null,
  onPick,
}: GameCardProps) {
  const readOnly = !onPick;
  const button = (side: Pick, team: string) => {
    const chosen = pick === side;
    // A picked team fills with its own colour (D-106); team colours are data, so set inline.
    const info = resolveTeam(team);
    const colour = info ? TEAM_INFO[info].primary : null;
    const teamFill =
      chosen && !readOnly && colour
        ? { background: colour, borderColor: colour, color: badgeInk(colour) }
        : undefined;
    return (
      <button
        type="button"
        className="pick pick-stacked"
        aria-pressed={chosen}
        data-state={readOnly ? 'locked' : undefined}
        data-team={teamFill ? '' : undefined}
        style={teamFill}
        disabled={readOnly}
        onClick={() => onPick?.(chosen ? null : side)}
      >
        {/* On a white disc, so the logo still shows when the button fills with the team's colour. */}
        <span className="inline-flex rounded-pill bg-surface p-0.5">
          <TeamMark team={team} size={40} />
        </span>
        <span className="break-words">{team}</span>
      </button>
    );
  };

  return (
    <li id={id} className="flex scroll-mt-28 flex-col gap-2 rounded-md bg-surface p-3">
      <p className="text-center font-heading text-colhead uppercase text-ink-muted">
        {kickoffLabel}
        {venueNote ? <span className="block normal-case">{venueNote}</span> : null}
      </p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {button('away', away)}
        <span className="font-heading text-ink-muted">at</span>
        {button('home', home)}
      </div>
    </li>
  );
}
