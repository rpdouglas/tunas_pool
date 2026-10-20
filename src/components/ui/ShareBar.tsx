import type { GameStatus } from '@shared/schedule';
import { NEUTRAL_BAR, barColours } from '@shared/teamColors';
import { resolveTeam } from '@shared/teams';
import { TeamMark } from './TeamMark';

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
  /** Kickoff, live score, or final, when the week is in play (D-104). */
  status?: GameStatus | null;
  /** The result is from the scores feed and not yet confirmed by the commissioner (D-098). */
  unofficial?: boolean;
  /** The side the person looking picked, if they entered. */
  myPick?: 'away' | 'home' | null;
  /** Few people picked the winner (D-103). */
  upset?: boolean;
}

/**
 * One game on the By game view, scoreboard style (DESIGN_SYSTEM §6, D-103): each team's logo with
 * its name under it, the score, how many picked each side, and a bar in the teams' colours. Before
 * kickoff it gives the time, and while the game is played the quarter and clock (D-104). The
 * winner, your pick, a live game, and an upset are said in words, never by color alone.
 */
export function ShareBar({
  awayTeam,
  homeTeam,
  awayCount,
  homeCount,
  awayPercent,
  homePercent,
  winner = null,
  status = null,
  unofficial = false,
  myPick = null,
  upset = false,
}: ShareBarProps) {
  const away = resolveTeam(awayTeam);
  const home = resolveTeam(homeTeam);
  const colours = away && home ? barColours(away, home) : { away: NEUTRAL_BAR, home: NEUTRAL_BAR };

  const side = (
    which: 'away' | 'home',
    team: string,
    count: number,
    percent: number,
    points: number | undefined,
  ) => {
    const won = winner === which;
    const right = which === 'home';
    return (
      <div
        className={`flex min-w-0 flex-col gap-1 ${right ? 'items-end text-right' : 'items-start'}`}
      >
        <div className={`flex items-center gap-3 ${right ? 'flex-row-reverse' : ''}`}>
          <TeamMark team={team} />
          {points !== undefined && (
            <span
              className={`font-heading text-h1 leading-none ${status?.kind === 'final' && !won ? 'text-ink-muted' : ''}`}
            >
              {points}
            </span>
          )}
        </div>
        <span className="break-words font-heading text-h3">
          {won && <span aria-hidden="true">✔ </span>}
          {team}
          {won && <span className="font-body text-body-sm font-semibold"> Won</span>}
        </span>
        <span className="text-body">
          {count} · {percent}%
        </span>
        {myPick === which && <span className="badge badge-open">Your pick</span>}
      </div>
    );
  };
  const points =
    status?.kind === 'live' || status?.kind === 'final'
      ? { away: status.awayPoints, home: status.homePoints }
      : null;
  const picked = awayCount + homeCount;
  const awayWidth = picked === 0 ? 50 : (awayCount / picked) * 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        {side('away', awayTeam, awayCount, awayPercent, points?.away)}
        {side('home', homeTeam, homeCount, homePercent, points?.home)}
      </div>
      {(status || upset) && (
        <p className="flex flex-wrap items-center gap-2 text-body-sm">
          {status?.kind === 'final' && (
            <span className="font-semibold">
              {status.label}
              {unofficial && <span className="font-normal text-ink-muted"> (unofficial)</span>}
            </span>
          )}
          {status?.kind === 'live' && (
            <>
              <span className="badge badge-open">
                <span aria-hidden="true">●</span>Live
              </span>
              <span className="font-semibold">{status.label}</span>
              <span className="text-ink-muted">Not counted until it's final.</span>
            </>
          )}
          {status?.kind === 'upcoming' && (
            <span className="text-ink-muted">Kickoff {status.label}</span>
          )}
          {status?.kind === 'off' && <span className="font-semibold">{status.label}</span>}
          {upset && (
            <span className="badge badge-pending">
              <span aria-hidden="true">⚡</span>Upset
            </span>
          )}
        </p>
      )}
      {/* Outlined, so light team colours still read on the white card (D-103). */}
      <div
        className="flex h-4 overflow-hidden rounded-pill border-2 border-line-strong"
        aria-hidden="true"
      >
        <div style={{ width: `${awayWidth}%`, background: colours.away }} />
        <div style={{ width: `${100 - awayWidth}%`, background: colours.home }} />
      </div>
    </div>
  );
}
