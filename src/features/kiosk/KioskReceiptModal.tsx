import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';

export interface KioskReceiptGame {
  id: string;
  away: string;
  home: string;
  slot?: string;
}

interface KioskReceiptModalProps {
  playerName: string;
  playerId: string;
  picks: Record<string, 'home' | 'away'>;
  games: KioskReceiptGame[];
  tiebreakerTotal: number;
  paymentMethod: 'cash' | 'etransfer';
  onDone: () => void;
}

const COUNTDOWN_INITIAL = 12;

export function KioskReceiptModal({
  playerName,
  playerId,
  picks,
  games,
  tiebreakerTotal,
  paymentMethod,
  onDone,
}: KioskReceiptModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_INITIAL);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onDone();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onDone]);

  const playerUrl = `${window.location.origin}/player/${playerId}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-title"
    >
      <div className="flex w-full max-w-lg flex-col gap-5 rounded-2xl bg-surface p-6 shadow-2xl">
        {/* Header with success badge */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <h2 id="receipt-title" className="font-heading text-h2 text-ink">
            Picks In! Good Luck, {playerName}!
          </h2>
          <p className="text-sm font-semibold text-ink-muted">
            {games.length} games picked · MNF tiebreaker: {tiebreakerTotal} pts
          </p>
        </div>

        {/* Payment reminder banner */}
        <div
          className={`rounded-xl p-4 text-center font-semibold ${
            paymentMethod === 'cash'
              ? 'bg-amber-100 text-amber-900 border border-amber-300'
              : 'bg-surface-sunken text-ink border border-ink/10'
          }`}
        >
          {paymentMethod === 'cash' ? (
            <p>
              💵 <span className="underline">Please hand your $20 cash to Devon or Ryan at the counter.</span>
            </p>
          ) : (
            <p>
              📱 e-Transfer: Send $20 to <span className="font-bold">payments@tunaspool.ca</span>
            </p>
          )}
        </div>

        {/* QR Code and phone sync */}
        <div className="flex items-center gap-4 rounded-xl bg-surface-muted p-4">
          <div className="rounded-lg bg-white p-2 shadow-sm">
            <QRCodeSVG value={playerUrl} size={90} level="M" />
          </div>
          <div className="flex flex-col gap-1 text-left">
            <p className="font-heading text-sm text-ink">Keep on your phone</p>
            <p className="text-xs text-ink-muted leading-relaxed">
              Scan this QR code with your phone camera to view your picks, standing, and history anytime.
            </p>
          </div>
        </div>

        {/* Picks summary compact list */}
        <div className="max-h-48 overflow-y-auto rounded-lg border border-ink/10 bg-surface-sunken/40 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">Your Selections</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {games.map((g) => {
              const pick = picks[g.id];
              const pickedTeam = pick === 'home' ? g.home : g.away;
              return (
                <div key={g.id} className="flex justify-between border-b border-ink/5 pb-1">
                  <span className="text-ink-muted">{g.slot === 'mnf' ? 'MNF' : g.away.slice(0, 3) + '@' + g.home.slice(0, 3)}:</span>
                  <span className="font-bold text-ink">{pickedTeam}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Countdown & Finish button */}
        <div className="flex flex-col gap-2 pt-2">
          <Button variant="primary" onClick={onDone} className="w-full text-lg py-3">
            Finish / Next Player
          </Button>
          <p className="text-center text-xs text-ink-muted">
            Screen will reset automatically in <span className="font-bold text-ink">{secondsLeft}</span> seconds.
          </p>
        </div>
      </div>
    </div>
  );
}
