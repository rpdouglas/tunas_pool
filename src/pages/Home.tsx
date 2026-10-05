import { Link } from 'react-router-dom';
import { formatMoney } from '@shared/scoring';
import { formatPoolDateTime } from '@shared/time';
import { Countdown } from '../components/ui/Countdown';
import { Panel } from '../components/ui/Panel';
import { StatTile } from '../components/ui/StatTile';
import { PawnShopHelmet, TunaBadge, WordmarkArt } from '../components/ui/BrandArt';
import { currentSeason } from '../lib/season';
import { useGuestSession } from '../features/auth/useAuth';
import { useCurrentWeek, useMyEntry } from '../features/entry/entryData';
import { useLastWinner } from '../features/leaderboard/revealData';
import { useSeasonLeaders } from '../features/leaderboard/standingsData';
import { formatRecord } from '@shared/scoring';
import { sharePoolMessage } from '@shared/messages';
import { shareText } from '../lib/share';
import { useState } from 'react';
import { WinnerBanner } from '../components/ui/WinnerBanner';
import { TextSizeControl } from '../components/ui/TextSizeControl';

/**
 * The weekly home screen (D-020): this week at a glance, your status, and the one next step.
 * The latest published winner (Sprint 6) and the season leader (Sprint 7) sit under it.
 */
export default function Home() {
  // Every player is signed in, as a guest if nothing else, before they make picks.
  const session = useGuestSession();
  const year = currentSeason();
  const current = useCurrentWeek(year);
  const week = current.data ?? null;
  const mine = useMyEntry(year, week?.id, session.user?.uid);
  const lastWinner = useLastWinner(year, Boolean(session.user)).data ?? null;
  const leaders = useSeasonLeaders(year, Boolean(session.user)).data ?? [];
  const leader = leaders[0] ?? null;
  const [shareNote, setShareNote] = useState<string | null>(null);

  async function sharePool() {
    const outcome = await shareText(sharePoolMessage(open && week ? week : null));
    setShareNote(
      outcome === 'copied'
        ? 'Invitation copied. Paste it into your group chat.'
        : outcome === 'failed'
          ? "Couldn't share from this browser."
          : null,
    );
  }

  const open = Boolean(week && week.status === 'open' && Date.now() < week.lockAtMs);
  const entry = mine.data?.entry ?? null;
  const payment = mine.data?.payment ?? null;

  return (
    <main className="bg-gameday min-h-screen px-4 pb-16 pt-8">
      <div className="mx-auto flex max-w-player flex-col gap-6">
        <h1 className="sr-only">Tunas Weekly Football Pool Pick 'Em</h1>
        <div className="flex flex-col items-center gap-3">
          <WordmarkArt className="w-72" />
          <span className="ribbon text-xl">Weekly Football Pool</span>
        </div>

        {current.isPending || (week && mine.isPending && session.user) ? (
          // About the height of the week's tiles and panel, so what's below doesn't jump when they arrive.
          <div className="min-h-[26rem]">
            <Panel>
              <p role="status" className="text-body">
                Loading this week…
              </p>
            </Panel>
          </div>
        ) : current.isError || session.failed ? (
          <Panel>
            <p role="alert" className="text-body">
              This week didn't load. Check your signal and refresh the page.
            </p>
          </Panel>
        ) : !week ? (
          <Panel>
            <div className="flex flex-col items-center gap-3 text-center">
              <TunaBadge className="w-36" />
              <p className="text-body">No week is open for picks right now. Check back soon!</p>
            </div>
          </Panel>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Week" value={String(week.weekNumber)} />
              <StatTile
                label="Entry fee"
                value={`$${(week.entryFeeCents / 100).toFixed(0)}`}
                accent
              />
            </div>

            <Panel title="This week">
              <div className="flex flex-col gap-4">
                <Countdown lockAtMs={week.lockAtMs} />

                <p className="text-body" data-testid="week-totals">
                  <strong>{week.entryCount}</strong>{' '}
                  {week.entryCount === 1 ? 'player is' : 'players are'} in. Pot{' '}
                  <strong>{formatMoney(week.paidCount * week.entryFeeCents)}</strong> so far.
                </p>

                <ul className="flex flex-col gap-2 text-body" aria-label="Your status">
                  <li>
                    {entry ? (
                      <>
                        <span aria-hidden="true">✓ </span>
                        <strong>Picks in.</strong> Submitted{' '}
                        {formatPoolDateTime(entry.picksSubmittedAt.toDate(), { weekday: 'short' })}.
                      </>
                    ) : open ? (
                      <>
                        <span aria-hidden="true">○ </span>
                        <strong>No picks yet.</strong>
                      </>
                    ) : (
                      <>
                        <span aria-hidden="true">🔒 </span>
                        <strong>Picks are locked.</strong> You didn't enter this week.
                      </>
                    )}
                  </li>
                  {entry && (
                    <li>
                      {payment?.paymentStatus === 'paid' ? (
                        <>
                          <span aria-hidden="true">✓ </span>
                          <strong>Paid.</strong> Payment confirmed.
                        </>
                      ) : (
                        <>
                          <span aria-hidden="true">💰 </span>
                          <strong>Payment pending</strong> until the pool confirms it.
                        </>
                      )}
                    </li>
                  )}
                  {entry && !open && (
                    <li>
                      <span aria-hidden="true">🔒 </span>
                      <strong>Locked.</strong> Good luck!
                    </li>
                  )}
                </ul>

                {open || entry ? (
                  <Link to={`/picks/${year}/${week.id}`} className="btn btn-primary">
                    {!entry
                      ? 'Make your picks'
                      : open
                        ? 'See or edit your picks'
                        : 'See your picks'}
                  </Link>
                ) : null}
                {!open && (
                  <Link to={`/week/${year}/${week.id}`} className="btn btn-secondary">
                    Standings and everyone's picks
                  </Link>
                )}
              </div>
            </Panel>
          </>
        )}

        {lastWinner?.winner && (
          <div className="flex flex-col gap-2">
            <WinnerBanner weekNumber={lastWinner.weekNumber} winner={lastWinner.winner} />
            {lastWinner.id !== week?.id && (
              <Link
                to={`/week/${year}/${lastWinner.id}`}
                className="inline-flex min-h-touch items-center justify-center text-body text-ink-inverse underline"
              >
                See how week {lastWinner.weekNumber} went
              </Link>
            )}
          </div>
        )}

        {session.user && !session.user.isAnonymous ? (
          <p className="text-center text-body text-ink-inverse">
            Signed in as {session.user.email}
          </p>
        ) : (
          <Link
            to="/account"
            className="inline-flex min-h-touch items-center justify-center text-body text-ink-inverse underline"
          >
            Played on another phone? Sign in with email
          </Link>
        )}

        {leader && (
          <Link
            to="/standings"
            className="flex min-h-touch items-center justify-center rounded-md bg-surface px-3 py-2 text-center text-body"
          >
            <span>
              {leaders.length === 1 ? (
                <>
                  Season leader: <strong>{leader.displayName}</strong>,{' '}
                  {formatRecord(leader.wins, leader.losses)}.
                </>
              ) : (
                <>
                  Tied for the season lead:{' '}
                  <strong>
                    {leaders.length === 2
                      ? `${leaders[0].displayName} and ${leaders[1].displayName}`
                      : `${leaders.length === 4 ? 'several' : leaders.length} players`}
                  </strong>{' '}
                  with {leader.wins} correct.
                </>
              )}{' '}
              <span className="text-ink-emphasis underline">See the standings</span>
            </span>
          </Link>
        )}

        <div className="flex flex-col gap-2">
          <button type="button" className="btn btn-ghost bg-surface" onClick={sharePool}>
            Share this pool
          </button>
          {shareNote && (
            <p role="status" className="text-center text-body text-ink-inverse">
              {shareNote}
            </p>
          )}
        </div>

        <nav aria-label="Your account" className="flex flex-col items-center">
          <Link
            to="/history"
            className="inline-flex min-h-touch items-center justify-center text-body text-ink-inverse underline"
          >
            Your history
          </Link>
          {week && open && (
            <Link
              to={`/sheet/${year}/${week.id}`}
              className="inline-flex min-h-touch items-center justify-center text-body text-ink-inverse underline"
            >
              Print a paper sheet
            </Link>
          )}
          {!leader && (
            <Link
              to="/standings"
              className="inline-flex min-h-touch items-center justify-center text-body text-ink-inverse underline"
            >
              Season standings
            </Link>
          )}
          {mine.data?.profile?.origin !== 'admin' && (
            <Link
              to="/claim"
              className="inline-flex min-h-touch items-center justify-center text-center text-body text-ink-inverse underline"
            >
              Played on paper, by text, or by phone before? Link your history
            </Link>
          )}
        </nav>

        <TextSizeControl onDark />

        <PawnShopHelmet className="mx-auto mt-2 w-44" />
      </div>
    </main>
  );
}
