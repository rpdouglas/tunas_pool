import { formatMoney, formatRecord } from '@shared/scoring';
import type { WeekWinner } from '@shared/types';

/**
 * Gold crown, name, record, tiebreaker points, and the pot (DESIGN_SYSTEM §6). The only animated
 * element: one drop, and none at all for people who ask for less motion.
 */
export function WinnerBanner({ weekNumber, winner }: { weekNumber: number; winner: WeekWinner }) {
  const split = winner.playerIds.length > 1;
  const names = winner.displayNames.join(' & ');
  return (
    <section
      aria-label={`Week ${weekNumber} winner`}
      className="flex flex-col items-center gap-1 rounded-lg border-3 border-black bg-gold-400 px-4 py-6 text-center text-black shadow-sticker"
    >
      <p className="animate-crown-drop text-h1 motion-reduce:animate-none" aria-hidden="true">
        👑
      </p>
      <p className="font-heading text-colhead uppercase">
        Week {weekNumber} {split ? 'winners' : 'winner'}
      </p>
      <p className="break-words font-heading text-h1 italic">{names}</p>
      <p className="font-heading text-h2">
        {formatRecord(winner.record.wins, winner.record.losses)}
      </p>
      {winner.decision !== 'most_wins' && winner.mnfPrediction !== null && (
        <p className="text-body">
          {split ? 'Split pot. ' : ''}Tiebreaker guess: {winner.mnfPrediction} points
        </p>
      )}
      <p className="font-heading text-h3">
        {split ? `${formatMoney(winner.shareCents)} each` : `Pot ${formatMoney(winner.potCents)}`}
      </p>
    </section>
  );
}
