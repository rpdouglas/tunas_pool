import { useMemo, useState } from 'react';
import { Search, UserPlus, HelpCircle, Check, ArrowLeft } from 'lucide-react';
import { GameCard } from '../../components/ui/GameCard';
import { Button } from '../../components/ui/Button';
import { Panel } from '../../components/ui/Panel';
import { currentSeason } from '../../lib/season';
import { formatPoolDateTime } from '@shared/time';
import type { Pick } from '@shared/types';
import type { KioskExistingEntry, KioskRosterPlayer } from '@shared/kiosk';
import { useCurrentWeek } from '../entry/entryData';
import {
  useKioskRoster,
  useSetKioskPin,
  useSubmitKioskEntry,
  useVerifyKioskPin,
} from './kioskData';
import { KioskLayout } from './KioskLayout';
import { KioskPinPad } from './KioskPinPad';
import { KioskReceiptModal } from './KioskReceiptModal';
import { KioskRegisterModal } from './KioskRegisterModal';

type KioskStage = 'select' | 'pin' | 'setup_pin' | 'existing_status' | 'picks' | 'receipt';

export default function KioskHomePage() {
  const year = currentSeason();
  const current = useCurrentWeek(year);
  const week = current.data ?? null;

  const rosterQuery = useKioskRoster();
  const verifyPin = useVerifyKioskPin();
  const setPin = useSetKioskPin();
  const submitEntry = useSubmitKioskEntry();

  const [search, setSearch] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<KioskRosterPlayer | null>(null);
  const [activePlayer, setActivePlayer] = useState<{
    playerId: string;
    displayName: string;
    pin: string;
  } | null>(null);

  const [stage, setStage] = useState<KioskStage>('select');
  const [pinError, setPinError] = useState<string | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showForgotPinDialog, setShowForgotPinDialog] = useState(false);

  const [existingEntry, setExistingEntry] = useState<KioskExistingEntry | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [tiebreaker, setTiebreaker] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'etransfer'>('cash');
  const [formError, setFormError] = useState<string | null>(null);

  const isOpen = Boolean(week && week.status === 'open' && Date.now() < week.lockAtMs);

  // Filter roster
  const filteredRoster = useMemo(() => {
    const list = rosterQuery.data ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return list;
    return list.filter((p) => p.displayName.toLowerCase().includes(query));
  }, [rosterQuery.data, search]);

  function resetSession() {
    setSelectedPlayer(null);
    setActivePlayer(null);
    setExistingEntry(null);
    setPicks({});
    setTiebreaker('');
    setPaymentMethod('cash');
    setPinError(null);
    setFormError(null);
    setStage('select');
  }

  function handleSelectPlayer(player: KioskRosterPlayer) {
    setSelectedPlayer(player);
    setPinError(null);
    if (!player.hasPin) {
      setStage('setup_pin');
    } else {
      setStage('pin');
    }
  }

  async function handleVerifyPin(enteredPin: string) {
    if (!selectedPlayer || !week) return;
    setPinError(null);
    try {
      const res = await verifyPin.mutateAsync({
        playerId: selectedPlayer.playerId,
        pin: enteredPin,
        year,
        weekId: week.id,
      });

      if (res.needsPinSetup) {
        setStage('setup_pin');
        return;
      }

      if (!res.valid) {
        setPinError(res.message || 'Incorrect PIN. Please try again.');
        return;
      }

      // Valid PIN
      setActivePlayer({
        playerId: selectedPlayer.playerId,
        displayName: selectedPlayer.displayName,
        pin: enteredPin,
      });

      if (res.existingEntry) {
        setExistingEntry(res.existingEntry);
        setStage('existing_status');
      } else {
        setPicks({});
        setTiebreaker('');
        setPaymentMethod('cash');
        setStage('picks');
      }
    } catch {
      setPinError('Connection error verifying PIN. Please try again.');
    }
  }

  async function handleSetupPin(newPin: string) {
    if (!selectedPlayer || !week) return;
    setPinError(null);
    try {
      await setPin.mutateAsync({
        playerId: selectedPlayer.playerId,
        currentPin: null,
        newPin,
      });

      setActivePlayer({
        playerId: selectedPlayer.playerId,
        displayName: selectedPlayer.displayName,
        pin: newPin,
      });

      setPicks({});
      setTiebreaker('');
      setPaymentMethod('cash');
      setStage('picks');
    } catch {
      setPinError('Could not set PIN. Please try again.');
    }
  }

  function handleStartEditing() {
    if (existingEntry) {
      setPicks(existingEntry.picks || {});
      setTiebreaker(String(existingEntry.tiebreakerTotal || ''));
      setPaymentMethod(existingEntry.paymentMethod === 'etransfer' ? 'etransfer' : 'cash');
    }
    setStage('picks');
  }

  function handleRegistered(playerId: string, displayName: string, pin: string) {
    setShowRegisterModal(false);
    setActivePlayer({ playerId, displayName, pin });
    setPicks({});
    setTiebreaker('');
    setPaymentMethod('cash');
    setStage('picks');
  }

  async function handleSubmitPicks(e: React.FormEvent) {
    e.preventDefault();
    if (!activePlayer || !week) return;
    setFormError(null);

    const games = week.games || [];
    const missing = games.filter((g) => !picks[g.id]);
    if (missing.length > 0) {
      setFormError(`Please make a pick for all ${games.length} games. (${missing.length} remaining)`);
      return;
    }

    const tbNum = parseInt(tiebreaker, 10);
    if (isNaN(tbNum) || tbNum < 0 || tbNum > 200) {
      setFormError('Please enter a Monday Night Football tiebreaker score between 0 and 200.');
      return;
    }

    try {
      await submitEntry.mutateAsync({
        year,
        weekId: week.id,
        playerId: activePlayer.playerId,
        pin: activePlayer.pin,
        picks,
        tiebreakerTotal: tbNum,
        paymentMethod,
        paymentIntent: 'will_do',
      });

      setStage('receipt');
    } catch (err: unknown) {
      setFormError((err as Error)?.message || 'Failed to submit picks. Please try again.');
    }
  }

  // Loading & error handling
  if (current.isPending || rosterQuery.isPending) {
    return (
      <KioskLayout activePlayerId={null} onResetSession={resetSession}>
        <Panel>
          <p role="status" className="p-4 text-center text-body">
            Loading kiosk…
          </p>
        </Panel>
      </KioskLayout>
    );
  }

  if (current.isError || !week) {
    return (
      <KioskLayout activePlayerId={null} onResetSession={resetSession}>
        <Panel>
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <h2 className="font-heading text-h2 text-ink">No Week Open</h2>
            <p className="text-body text-ink-muted">
              Picks are not currently open for submission. Please check back or ask Devon at the counter.
            </p>
          </div>
        </Panel>
      </KioskLayout>
    );
  }

  const weekLabel = `Week ${week.weekNumber}`;
  const lockLabel = isOpen ? formatPoolDateTime(new Date(week.lockAtMs)) : null;

  return (
    <KioskLayout
      activePlayerId={activePlayer?.playerId}
      onResetSession={resetSession}
      weekLabel={weekLabel}
      lockLabel={lockLabel}
    >
      {/* STAGE 1: PLAYER SELECTION */}
      {stage === 'select' && (
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl bg-surface p-6 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="font-heading text-h2 text-ink">Make Your Picks</h1>
                <p className="mt-1 text-body text-ink-muted">
                  Tap your name on the roster below, or register if you're new!
                </p>
              </div>

              <Button
                variant="primary"
                onClick={() => setShowRegisterModal(true)}
                className="flex items-center gap-2 self-start sm:self-auto"
              >
                <UserPlus className="h-5 w-5" />
                I'm New to the Pool
              </Button>
            </div>

            {/* Search Input */}
            <div className="mt-5 relative">
              <Search className="absolute left-4 top-3.5 h-5 w-5 text-ink-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type your name to find yourself quickly…"
                className="input-field pl-12 text-lg h-12"
              />
            </div>

            {/* Roster Names Grid */}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 max-h-[460px] overflow-y-auto p-1">
              {filteredRoster.map((player) => (
                <button
                  key={player.playerId}
                  type="button"
                  onClick={() => handleSelectPlayer(player)}
                  className="flex min-h-[56px] items-center justify-between rounded-xl border border-ink/10 bg-surface-muted px-4 py-3 text-left font-semibold text-ink shadow-sm transition active:scale-95 hover:border-brand-gold hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-gold"
                >
                  <span className="truncate text-base">{player.displayName}</span>
                  {!player.hasPin && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                      New
                    </span>
                  )}
                </button>
              ))}

              {filteredRoster.length === 0 && (
                <div className="col-span-full py-8 text-center text-ink-muted">
                  <p>No player found matching "{search}".</p>
                  <Button
                    variant="ghost"
                    onClick={() => setShowRegisterModal(true)}
                    className="mt-2 text-brand-ravens"
                  >
                    Click here to register as a new player
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STAGE 2A: PIN VERIFICATION */}
      {stage === 'pin' && selectedPlayer && (
        <div className="mx-auto w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl">
          <KioskPinPad
            label={`Welcome back, ${selectedPlayer.displayName}`}
            sublabel="Enter your 4-digit PIN to continue"
            error={pinError}
            disabled={verifyPin.isPending}
            onComplete={handleVerifyPin}
            onCancel={resetSession}
          />
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShowForgotPinDialog(true)}
              className="text-xs font-semibold text-ink-muted hover:underline"
            >
              Forgot your PIN?
            </button>
          </div>
        </div>
      )}

      {/* STAGE 2B: INITIAL PIN SETUP */}
      {stage === 'setup_pin' && selectedPlayer && (
        <div className="mx-auto w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl">
          <KioskPinPad
            label={`Welcome, ${selectedPlayer.displayName}!`}
            sublabel="Choose a 4-digit PIN for future tablet visits"
            error={pinError}
            disabled={setPin.isPending}
            onComplete={handleSetupPin}
            onCancel={resetSession}
          />
        </div>
      )}

      {/* STAGE 2C: EXISTING ENTRY STATUS */}
      {stage === 'existing_status' && activePlayer && existingEntry && (
        <div className="mx-auto w-full max-w-md rounded-2xl bg-surface p-6 text-center shadow-xl">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Check className="h-7 w-7" />
          </div>
          <h2 className="font-heading text-h2 text-ink">
            Picks Already In!
          </h2>
          <p className="mt-1 text-body text-ink-muted">
            {activePlayer.displayName}, your picks are already entered for Week {week.weekNumber}.
          </p>

          <div className="my-6 rounded-xl bg-surface-muted p-4 text-left">
            <p className="text-xs font-bold uppercase text-ink-muted">Current Picks</p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {Object.keys(existingEntry.picks || {}).length} games picked · MNF Tiebreaker: {existingEntry.tiebreakerTotal} pts
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {isOpen ? (
              <Button variant="primary" onClick={handleStartEditing} className="w-full py-3 text-lg font-bold">
                Edit My Picks
              </Button>
            ) : (
              <p className="text-sm font-semibold text-ink-urgent">
                Picks are now locked for this week.
              </p>
            )}
            <Button variant="ghost" onClick={resetSession}>
              Done / Return to Start
            </Button>
          </div>
        </div>
      )}

      {/* STAGE 3: PICK FORM */}
      {stage === 'picks' && activePlayer && (
        <form onSubmit={handleSubmitPicks} className="flex flex-col gap-5">
          <div className="flex items-center justify-between rounded-xl bg-surface p-4 shadow-sm">
            <div>
              <p className="text-xs font-bold uppercase text-ink-muted">Making picks as:</p>
              <h2 className="font-heading text-h3 text-ink">{activePlayer.displayName}</h2>
            </div>
            <Button variant="ghost" onClick={resetSession} className="flex items-center gap-1 text-sm">
              <ArrowLeft className="h-4 w-4" /> Switch Player
            </Button>
          </div>

          {/* Sunday Games */}
          <div className="rounded-2xl bg-surface p-5 shadow-md">
            <div className="mb-4 flex items-center justify-between border-b border-ink/10 pb-3">
              <h3 className="font-heading text-h3 text-ink">Pick the Winners</h3>
              <span className="text-xs font-semibold text-ink-muted">
                {Object.keys(picks).length} of {week.games.length} picked
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {week.games.map((game) => (
                <GameCard
                  key={game.id}
                  away={game.away}
                  home={game.home}
                  kickoffLabel={game.slot === 'mnf' ? 'Monday Night' : 'Sunday'}
                  pick={picks[game.id] || null}
                  onPick={(chosen) => {
                    setPicks((prev) => {
                      const next = { ...prev };
                      if (chosen) next[game.id] = chosen;
                      else delete next[game.id];
                      return next;
                    });
                  }}
                />
              ))}
            </div>
          </div>

          {/* Monday Night Tiebreaker */}
          <div className="rounded-2xl bg-surface p-5 shadow-md">
            <h3 className="font-heading text-h3 text-ink">Monday Night Tiebreaker</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Guess the total combined points scored by both teams on Monday Night Football.
            </p>

            <div className="mt-4 max-w-[200px]">
              <input
                type="number"
                min="0"
                max="200"
                value={tiebreaker}
                onChange={(e) => setTiebreaker(e.target.value)}
                placeholder="Total Pts"
                className="input-field text-xl font-bold"
                required
              />
            </div>
          </div>

          {/* Payment Method */}
          <div className="rounded-2xl bg-surface p-5 shadow-md">
            <h3 className="font-heading text-h3 text-ink">Payment Method ($20 Entry)</h3>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`flex flex-col rounded-xl border-2 p-4 text-left transition ${
                  paymentMethod === 'cash'
                    ? 'border-brand-ravens bg-brand-ravens/5 ring-2 ring-brand-ravens'
                    : 'border-ink/10 bg-surface-muted hover:bg-surface-sunken'
                }`}
              >
                <span className="font-bold text-base text-ink">💵 Pay Cash at the Counter</span>
                <span className="text-xs text-ink-muted mt-1">
                  Hand your $20 cash directly to Devon or Ryan at the counter.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('etransfer')}
                className={`flex flex-col rounded-xl border-2 p-4 text-left transition ${
                  paymentMethod === 'etransfer'
                    ? 'border-brand-ravens bg-brand-ravens/5 ring-2 ring-brand-ravens'
                    : 'border-ink/10 bg-surface-muted hover:bg-surface-sunken'
                }`}
              >
                <span className="font-bold text-base text-ink">📱 Pay by e-Transfer</span>
                <span className="text-xs text-ink-muted mt-1">
                  Send $20 to payments@tunaspool.ca from your phone.
                </span>
              </button>
            </div>
          </div>

          {formError && (
            <div className="rounded-xl bg-red-50 p-4 text-center font-semibold text-ink-urgent" role="alert">
              {formError}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Button
              type="submit"
              variant="primary"
              disabled={submitEntry.isPending}
              className="w-full text-lg font-bold py-3"
            >
              {submitEntry.isPending ? 'Submitting Picks…' : 'Submit My Picks'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={resetSession}
              disabled={submitEntry.isPending}
            >
              Cancel & Exit
            </Button>
          </div>
        </form>
      )}

      {/* STAGE 4: RECEIPT MODAL */}
      {stage === 'receipt' && activePlayer && week && (
        <KioskReceiptModal
          playerName={activePlayer.displayName}
          playerId={activePlayer.playerId}
          picks={picks}
          games={week.games}
          tiebreakerTotal={parseInt(tiebreaker, 10) || 0}
          paymentMethod={paymentMethod}
          onDone={resetSession}
        />
      )}

      {/* REGISTRATION MODAL */}
      <KioskRegisterModal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        onRegistered={handleRegistered}
      />

      {/* FORGOT PIN DIALOG */}
      {showForgotPinDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center shadow-xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-sunken text-ink">
              <HelpCircle className="h-7 w-7" />
            </div>
            <h3 className="font-heading text-h3 text-ink">Forgot Your PIN?</h3>
            <p className="mt-2 text-sm text-ink-muted">
              Ask Devon or Ryan right at the shop counter! They can reset your PIN in person with one tap so you can choose a new one immediately.
            </p>
            <div className="mt-6">
              <Button variant="primary" onClick={() => setShowForgotPinDialog(false)}>
                Got It
              </Button>
            </div>
          </div>
        </div>
      )}
    </KioskLayout>
  );
}
