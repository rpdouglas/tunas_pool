export interface ProgressBarProps {
  done: number;
  total: number;
  /** Jump to the next game without a pick. Omit when everything is picked. */
  onNext?: () => void;
  /** What is being counted: "picked" on the entry form, "results in" on the results screen. */
  noun?: string;
  /** Accessible name of the bar. */
  ariaLabel?: string;
}

/** Sticky "9 of 15 picked" bar (DESIGN_SYSTEM §6). Tap it to jump to the next unpicked game. */
export function ProgressBar({
  done,
  total,
  onNext,
  noun = 'picked',
  ariaLabel = 'Picks made',
}: ProgressBarProps) {
  const complete = done >= total;
  const label = complete ? `All ${total} ${noun}` : `${done} of ${total} ${noun}`;
  return (
    <div className="progress-bar">
      <div className="mx-auto flex max-w-player items-center gap-3 px-4 py-2">
        <div className="flex flex-1 flex-col gap-1">
          <p className="font-heading text-h3" aria-live="polite">
            {complete && <span aria-hidden="true">✓ </span>}
            {label}
          </p>
          <div
            className="progress-track"
            role="progressbar"
            aria-label={ariaLabel}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
          >
            <div
              className="progress-fill"
              style={{ width: `${(Math.min(done, total) / total) * 100}%` }}
            />
          </div>
        </div>
        {!complete && onNext && (
          <button
            type="button"
            className="btn btn-primary min-w-touch px-3 text-body"
            onClick={onNext}
          >
            Next game
          </button>
        )}
      </div>
    </div>
  );
}
