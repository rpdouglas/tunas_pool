export interface ProgressBarProps {
  done: number;
  total: number;
  /** Jump to the next game without a pick. Omit when everything is picked. */
  onNext?: () => void;
}

/** Sticky "9 of 15 picked" bar (DESIGN_SYSTEM §6). Tap it to jump to the next unpicked game. */
export function ProgressBar({ done, total, onNext }: ProgressBarProps) {
  const complete = done >= total;
  const label = complete ? `All ${total} picked` : `${done} of ${total} picked`;
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
            aria-label="Picks made"
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
