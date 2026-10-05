import type { ReactNode } from 'react';
import { formatRecord } from '@shared/scoring';

export interface LeaderboardRowProps {
  /** "1", or "Tied 3" when players are level. */
  rankLabel: string;
  name: string;
  wins: number;
  losses: number;
  /** Wins still possible. Shown only while games remain. */
  bestPossible?: number;
  /** This row is the person looking at the screen. */
  you?: boolean;
  /** The published winner of the week. */
  winner?: boolean;
  /** An entry added or changed after the lock, with the commissioner's approval. */
  late?: boolean;
  /** Shown when the row is opened: that player's picks. */
  children?: ReactNode;
}

/**
 * One line of the weekly leaderboard (DESIGN_SYSTEM §6): place, name, record. Tap to open that
 * player's picks. "You", the winner, and a late entry are said in words, never by color alone.
 */
export function LeaderboardRow({
  rankLabel,
  name,
  wins,
  losses,
  bestPossible,
  you = false,
  winner = false,
  late = false,
  children,
}: LeaderboardRowProps) {
  const summary = (
    <>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="w-14 flex-none text-body-sm text-ink-muted">{rankLabel}</span>
        <span className="min-w-0 break-words font-heading text-h3">
          {winner && <span aria-hidden="true">👑 </span>}
          {name}
        </span>
        {you && <span className="badge badge-open">You</span>}
        {winner && <span className="sr-only">Winner</span>}
        {late && <span className="badge badge-pending">Late entry</span>}
      </span>
      <span className="flex-none text-right text-body">
        <strong>{formatRecord(wins, losses)}</strong>
        {bestPossible !== undefined && (
          <span className="block text-body-sm text-ink-muted">best {bestPossible}</span>
        )}
      </span>
    </>
  );
  const frame = `rounded-md border-2 bg-surface ${you ? 'border-line-strong' : 'border-line-subtle'}`;

  if (!children) {
    return (
      <li className={`${frame} flex min-h-touch items-center justify-between gap-2 px-3 py-2`}>
        {summary}
      </li>
    );
  }
  return (
    <li className={frame}>
      <details>
        <summary className="flex min-h-touch cursor-pointer items-center justify-between gap-2 px-3 py-2">
          {summary}
        </summary>
        <div className="border-t border-line-subtle px-3 py-2">{children}</div>
      </details>
    </li>
  );
}
