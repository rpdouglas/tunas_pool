import { useState } from 'react';
import { BINGO_HIGH, BINGO_PICKS } from '@shared/bingo';
import { Button } from './Button';

export interface BingoNumberPickerProps {
  onSubmit: (numbers: number[] | null) => void;
  busy?: boolean;
  error?: string | null;
}

/**
 * Pick six numbers from 1 to 49, like a lottery slip, or let the computer pick (quick pick sends
 * null). Six across, so each number keeps a 48px target at 375px (D-132).
 */
export function BingoNumberPicker({ onSubmit, busy, error }: BingoNumberPickerProps) {
  const [picked, setPicked] = useState<number[]>([]);
  const full = picked.length === BINGO_PICKS;
  const toggle = (n: number) =>
    setPicked((p) =>
      p.includes(n) ? p.filter((x) => x !== n) : full ? p : [...p, n].sort((a, b) => a - b),
    );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body font-semibold" role="status">
        {picked.length} of {BINGO_PICKS} picked{picked.length ? `: ${picked.join(', ')}` : ''}
      </p>
      <div className="grid grid-cols-6 gap-1" role="group" aria-label="Numbers 1 to 49">
        {Array.from({ length: BINGO_HIGH }, (_, i) => i + 1).map((n) => {
          const on = picked.includes(n);
          return (
            <button
              key={n}
              type="button"
              className="bingo-pick"
              aria-pressed={on}
              disabled={busy || (full && !on)}
              onClick={() => toggle(n)}
            >
              {n}
            </button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="text-body font-semibold text-ink-urgent">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      ) : null}
      <Button onClick={() => onSubmit(picked)} disabled={busy || !full}>
        Add this card
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={() => onSubmit(null)} disabled={busy}>
          Quick pick
        </Button>
        <Button
          variant="ghost"
          onClick={() => setPicked([])}
          disabled={busy || picked.length === 0}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
