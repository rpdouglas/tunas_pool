import { dollars, drawDay } from '@shared/bingoView';
import { Panel } from './Panel';

/** A finished game, as Past games shows it. Winners are named here, after the game (D-123). */
export interface PastGameView {
  number: number;
  status: 'open' | 'won' | 'capped';
  test: boolean;
  potCents: number;
  drawsApproved: number;
  closingDraw: string | null;
  carriedOutCents: number;
  winners: { cardId: string; displayName: string; hits: number; shareCents: number }[];
}

export function BingoPastGame({ c }: { c: PastGameView }) {
  const when = c.closingDraw ? drawDay(c.closingDraw) : '';
  return (
    <Panel title={`Game ${c.number}${c.test ? ' (practice)' : ''}`}>
      <div className="flex flex-col gap-2 text-body">
        {c.status === 'won' ? (
          <p className="font-semibold">
            Won {when}, after {c.drawsApproved} draw{c.drawsApproved === 1 ? '' : 's'}.
          </p>
        ) : (
          <p className="font-semibold">
            Reached its last week {when}.{' '}
            {c.winners.length > 0
              ? 'The cards with the most crossed off split it.'
              : 'Nobody was paid in, so the pot carried over.'}
          </p>
        )}
        <p>Pot: {dollars(c.potCents)}</p>
        {c.winners.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {c.winners.map((w) => (
              <li key={w.cardId}>
                {w.displayName}: {dollars(w.shareCents)} ({w.hits} of 6)
              </li>
            ))}
          </ul>
        ) : (
          <p>Carried over: {dollars(c.carriedOutCents)}</p>
        )}
      </div>
    </Panel>
  );
}
