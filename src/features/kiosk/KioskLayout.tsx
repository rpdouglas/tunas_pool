import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { WordmarkArt } from '../../components/ui/BrandArt';
import { Button } from '../../components/ui/Button';

interface KioskLayoutProps {
  children: ReactNode;
  activePlayerId?: string | null;
  onResetSession?: () => void;
  weekLabel?: string;
  lockLabel?: string | null;
}

const INACTIVITY_TIMEOUT_MS = 60_000;
const WARNING_COUNTDOWN_SECONDS = 10;

export function KioskLayout({
  children,
  activePlayerId,
  onResetSession,
  weekLabel,
  lockLabel,
}: KioskLayoutProps) {
  const navigate = useNavigate();
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [warningSecondsLeft, setWarningSecondsLeft] = useState(WARNING_COUNTDOWN_SECONDS);

  // Inactivity detection
  useEffect(() => {
    // Only monitor inactivity if there is an active player or session in progress
    if (!activePlayerId) {
      setShowInactivityWarning(false);
      return;
    }

    let warningTimer: ReturnType<typeof setTimeout> | null = null;
    let countdownInterval: ReturnType<typeof setInterval> | null = null;

    function resetActivity() {
      setShowInactivityWarning(false);
      setWarningSecondsLeft(WARNING_COUNTDOWN_SECONDS);

      if (warningTimer) clearTimeout(warningTimer);
      if (countdownInterval) clearInterval(countdownInterval);

      warningTimer = setTimeout(() => {
        setShowInactivityWarning(true);
        setWarningSecondsLeft(WARNING_COUNTDOWN_SECONDS);

        let countdown = WARNING_COUNTDOWN_SECONDS;
        countdownInterval = setInterval(() => {
          countdown -= 1;
          setWarningSecondsLeft(countdown);
          if (countdown <= 0) {
            clearInterval(countdownInterval!);
            setShowInactivityWarning(false);
            if (onResetSession) onResetSession();
          }
        }, 1000);
      }, INACTIVITY_TIMEOUT_MS);
    }

    const events = ['touchstart', 'mousedown', 'keydown', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, resetActivity, { passive: true }));
    resetActivity();

    return () => {
      if (warningTimer) clearTimeout(warningTimer);
      if (countdownInterval) clearInterval(countdownInterval);
      events.forEach((ev) => window.removeEventListener(ev, resetActivity));
    };
  }, [activePlayerId, onResetSession]);

  return (
    <div className="bg-gameday min-h-screen px-4 pb-16 pt-4 text-ink">
      <div className="mx-auto flex max-w-player flex-col gap-5">
        {/* Kiosk Header */}
        <header className="flex items-center justify-between border-b border-ink/10 pb-3">
          <div className="flex items-center gap-3">
            <WordmarkArt className="h-8 w-auto max-w-[160px]" />
            <span className="rounded bg-brand-gold/20 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-brand-gold">
              Shop Kiosk
            </span>
          </div>

          <div className="flex items-center gap-3">
            {weekLabel && (
              <span className="text-sm font-semibold text-ink-muted">
                {weekLabel} {lockLabel ? `· Locks ${lockLabel}` : ''}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowExitConfirm(true)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-gold"
              aria-label="Staff exit"
              title="Staff Exit"
            >
              <Lock className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main>{children}</main>

        {/* Staff Exit Confirmation Dialog */}
        {showExitConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-exit-title"
          >
            <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl">
              <h2 id="staff-exit-title" className="font-heading text-h3 text-ink">
                Exit Kiosk Mode?
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                Return to Devon’s Counter dashboard. Players will no longer be able to make picks on this tablet.
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    setShowExitConfirm(false);
                    navigate('/counter');
                  }}
                >
                  Yes, Go to Counter
                </Button>
                <Button variant="ghost" onClick={() => setShowExitConfirm(false)}>
                  Cancel (Stay in Kiosk)
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Inactivity Warning Dialog */}
        {showInactivityWarning && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="inactivity-title"
          >
            <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center shadow-2xl">
              <h2 id="inactivity-title" className="font-heading text-h3 text-ink">
                Still there?
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                Returning to the start screen in <span className="font-bold text-ink-urgent">{warningSecondsLeft}</span> seconds to protect your account.
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    setShowInactivityWarning(false);
                    setWarningSecondsLeft(WARNING_COUNTDOWN_SECONDS);
                  }}
                >
                  I'm Still Here
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowInactivityWarning(false);
                    if (onResetSession) onResetSession();
                  }}
                >
                  Done / Log Out Now
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
