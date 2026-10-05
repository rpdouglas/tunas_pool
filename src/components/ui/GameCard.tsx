import type { Pick } from '@shared/types';

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
 * One game on the sheet: kickoff on top, then away | at | home (DESIGN_SYSTEM §6).
 * Tap a team to pick it, tap again to clear. Without `onPick` the card is read-only.
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
  const button = (side: Pick, team: string) => (
    <button
      type="button"
      className="pick"
      aria-pressed={pick === side}
      data-state={readOnly ? 'locked' : undefined}
      disabled={readOnly}
      onClick={() => onPick?.(pick === side ? null : side)}
    >
      {team}
    </button>
  );

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
