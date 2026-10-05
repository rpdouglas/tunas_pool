import type { Pick } from '@shared/types';

export interface PickRowProps {
  /** Lets the form jump to this game. */
  id?: string;
  /** The game's number on the paper sheet, 1 to 15. */
  number: number;
  away: string;
  home: string;
  pick?: Pick | null;
  onPick: (pick: Pick | null) => void;
}

/**
 * One numbered line of the paper sheet, for copying a sheet straight down (PERSONAS: Rosalie, the
 * Commissioner). Tighter than a GameCard: no kickoff time, the sheet's number instead. Tap a team
 * to pick it, tap again to leave the game blank.
 */
export function PickRow({ id, number, away, home, pick = null, onPick }: PickRowProps) {
  const button = (side: Pick, team: string) => (
    <button
      type="button"
      className="pick min-w-0 break-words px-1"
      aria-pressed={pick === side}
      onClick={() => onPick(pick === side ? null : side)}
    >
      {team}
    </button>
  );

  return (
    <li id={id} className="scroll-mt-28">
      <div
        role="group"
        aria-label={`Game ${number}: ${away} at ${home}`}
        className="grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2"
      >
        <span className="text-center font-heading text-h3 text-ink-muted" aria-hidden="true">
          {number}
        </span>
        {button('away', away)}
        {button('home', home)}
      </div>
    </li>
  );
}
