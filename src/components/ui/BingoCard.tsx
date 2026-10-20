import { useState } from 'react';
import { hitsInWords, paidWeeksText, paymentText, type PaymentView } from '@shared/bingoView';
import { Button } from './Button';
import { Panel } from './Panel';
import { SegmentedChoice } from './SegmentedChoice';

/** A card's six numbers as balls (D-132). Crossed off is purple with a check, and said in words too. */
export function BingoBalls({
  numbers,
  hits,
}: {
  numbers: readonly number[];
  hits: readonly number[];
}) {
  const crossed = new Set(hits);
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="The card's numbers">
      {numbers.map((n) => (
        <li key={n} className="bingo-ball" data-hit={crossed.has(n) ? 'true' : undefined}>
          {n}
          <span className="sr-only">{crossed.has(n) ? ', crossed off' : ', not yet'}</span>
        </li>
      ))}
    </ul>
  );
}

export interface BingoCardPanelProps {
  title: string;
  numbers: readonly number[];
  hits: readonly number[];
  paidDraws: number;
  drawsSoFar: number;
  /** The draw money is due for now. */
  dueDraw: string;
  payment: PaymentView | null;
  onIntent?: (intent: 'cash' | 'etransfer') => void;
  onRetire?: () => void;
  busy?: boolean;
}

/** One of my cards: its numbers, what's crossed off, the weeks paid, and this week's payment. */
export function BingoCardPanel({
  title,
  numbers,
  hits,
  paidDraws,
  drawsSoFar,
  dueDraw,
  payment,
  onIntent,
  onRetire,
  busy,
}: BingoCardPanelProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Panel title={title}>
      <div className="flex flex-col gap-3">
        <BingoBalls numbers={numbers} hits={hits} />
        <p className="text-body font-semibold">{hitsInWords(hits)}</p>
        <p className="text-body text-ink-muted">{paidWeeksText(paidDraws, drawsSoFar)}</p>
        <p className="text-body" role="status">
          {payment?.paid ? <span aria-hidden="true">✓ </span> : null}
          {paymentText(dueDraw, payment)}
        </p>
        {onIntent && !payment?.paid ? (
          <SegmentedChoice
            legend="How will you pay for this week?"
            options={[
              { value: 'cash', label: 'Cash at the shop' },
              { value: 'etransfer', label: 'e-Transfer' },
            ]}
            value={payment?.intent ?? null}
            onChange={onIntent}
            disabled={busy}
          />
        ) : null}
        {onRetire ? (
          confirming ? (
            <div className="flex flex-col gap-2">
              <p className="text-body">
                Stop this card? It stops renewing. What it has crossed off stays, but it can't be
                paid for again.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
                  Keep it
                </Button>
                <Button variant="secondary" onClick={onRetire} disabled={busy}>
                  Stop the card
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="min-h-touch self-start text-body text-ink-muted underline"
              onClick={() => setConfirming(true)}
            >
              Stop this card
            </button>
          )
        ) : null}
      </div>
    </Panel>
  );
}
