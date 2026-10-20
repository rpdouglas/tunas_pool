import type { TiebreakSummary } from '@shared/tiebreak';

export interface TiebreakerPanelProps {
  /** The Monday night total: final, so far, or null before kickoff. */
  total: number | null;
  /** What the total is, in words: "final", "final (unofficial)", "so far · Q3 · 7:21", or the kickoff. */
  totalNote: string;
  summary: TiebreakSummary;
}

const side = (guess: number, total: number | null) =>
  total === null ? null : guess >= total ? 'at or over' : 'under';

/**
 * The Monday night tiebreaker under that game on the By game view (D-105): the total, your guess,
 * the spread of guesses, and who is tied for the lead with theirs. Display only; the published
 * winner is decided by the commissioner's results. "At or over" and "under" are said in words.
 */
export function TiebreakerPanel({ total, totalNote, summary }: TiebreakerPanelProps) {
  const { guesses, low, high, middle, mine, leaders } = summary;
  // Where the total falls in the sorted list of guesses, so it can be marked there.
  const totalAt = total === null ? -1 : guesses.findIndex((g) => g.guess >= total);

  return (
    <section
      aria-label="Monday night tiebreaker"
      className="flex flex-col gap-2 rounded-md bg-surface-muted p-3 text-body"
    >
      <h3 className="font-heading text-h3">Tiebreaker</h3>
      <p>
        Monday night total:{' '}
        {total === null ? (
          <span className="text-ink-muted">{totalNote}</span>
        ) : (
          <>
            <strong>{total}</strong> <span className="text-ink-muted">{totalNote}</span>
          </>
        )}
      </p>
      {mine !== null && (
        <p>
          Your guess: <strong>{mine}</strong>
          {side(mine, total) && <span className="text-ink-muted"> ({side(mine, total)})</span>}
        </p>
      )}
      {low !== null && (
        <p>
          Guesses run from {low} to {high}. The middle guess is {middle}.
        </p>
      )}

      {leaders.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="font-semibold">Tied for the lead right now:</p>
          <ol className="flex flex-col gap-1">
            {leaders.map((l) => (
              <li key={l.playerId} className="flex flex-wrap justify-between gap-x-3">
                <span>{l.displayName}</span>
                <span>
                  <strong>{l.guess}</strong>
                  {l.atOrOver !== null && (
                    <span className="text-ink-muted"> {l.atOrOver ? 'at or over' : 'under'}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-body-sm text-ink-muted">
            If the wins stay tied, the lowest guess at or over the final total wins. If nobody is at
            or over, the highest guess wins.
          </p>
        </div>
      )}

      {guesses.length > 0 && (
        <details>
          <summary className="min-h-touch cursor-pointer py-2 font-semibold text-ink-emphasis underline">
            Everyone's guesses ({guesses.length})
          </summary>
          <ol className="flex flex-col gap-1">
            {guesses.map((g, i) => (
              <li key={g.playerId} className="flex flex-col gap-1">
                {i === totalAt && <TotalMark total={total!} note={totalNote} />}
                <span className="flex justify-between gap-3">
                  <span>{g.displayName}</span>
                  <strong>{g.guess}</strong>
                </span>
              </li>
            ))}
            {total !== null && totalAt === -1 && (
              <li>
                <TotalMark total={total} note={totalNote} />
              </li>
            )}
          </ol>
        </details>
      )}
    </section>
  );
}

function TotalMark({ total, note }: { total: number; note: string }) {
  return (
    <span className="rounded-sm border-y-2 border-line-strong py-1 text-center font-semibold">
      Total {total} {note}
    </span>
  );
}
