export interface ShareBarProps {
  awayTeam: string;
  homeTeam: string;
  awayCount: number;
  homeCount: number;
  /** Whole-number percents of everyone who entered. */
  awayPercent: number;
  homePercent: number;
  /** The side that won, once the game is decided. A tie has no winner. */
  winner?: 'away' | 'home' | null;
}

/**
 * How the pool split on one game (DESIGN_SYSTEM §6): each team with its count and percent, and a
 * two-part bar. The winner is marked with a check and the word "Won", never by color alone.
 */
export function ShareBar({
  awayTeam,
  homeTeam,
  awayCount,
  homeCount,
  awayPercent,
  homePercent,
  winner = null,
}: ShareBarProps) {
  const side = (team: string, count: number, percent: number, won: boolean, align: string) => (
    <p className={`flex min-w-0 flex-col ${align}`}>
      <span className="break-words font-heading text-h3">
        {won && <span aria-hidden="true">✔ </span>}
        {team}
        {won && <span className="font-body text-body-sm font-semibold"> Won</span>}
      </span>
      <span className="text-body">
        {count} · {percent}%
      </span>
    </p>
  );
  const picked = awayCount + homeCount;
  const awayWidth = picked === 0 ? 50 : (awayCount / picked) * 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        {side(awayTeam, awayCount, awayPercent, winner === 'away', 'items-start text-left')}
        {side(homeTeam, homeCount, homePercent, winner === 'home', 'items-end text-right')}
      </div>
      <div className="flex h-3 overflow-hidden rounded-pill bg-purple-100" aria-hidden="true">
        <div className="bg-purple-700" style={{ width: `${awayWidth}%` }} />
        <div className="bg-gold-400" style={{ width: `${100 - awayWidth}%` }} />
      </div>
    </div>
  );
}
