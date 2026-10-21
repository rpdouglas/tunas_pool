import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  PICK_MARK_TEXT,
  gameShare,
  isUpset,
  leaderboard,
  pickMark,
  rankLabel,
  shareLine,
  sharePercent,
  type LeaderboardRow as Row,
  type RevealEntry,
} from '@shared/reveal';
import { gameStatuses, withUnofficialResults, type FeedScore } from '@shared/schedule';
import { explainOutcome, formatMoney } from '@shared/scoring';
import { tiebreakSummary } from '@shared/tiebreak';
import { formatPoolDateTime } from '@shared/time';
import { Button } from '../../components/ui/Button';
import { GameDayPage } from '../../components/layout/GameDayPage';
import { LeaderboardRow } from '../../components/ui/LeaderboardRow';
import { Panel } from '../../components/ui/Panel';
import { ShareBar } from '../../components/ui/ShareBar';
import { TiebreakerPanel } from '../../components/ui/TiebreakerPanel';
import { WinnerBanner } from '../../components/ui/WinnerBanner';
import type { WeekView } from '../../lib/weekModel';
import { useAuth, useGuestSession } from '../auth/useAuth';
import { BoardSection } from '../board/BoardSection';
import { EarlierBoards } from '../board/EarlierBoards';
import { useBoardStanding } from '../board/boardData';
import { useMyProfile } from '../claims/claimsData';
import { BeforeLock } from './BeforeLock';
import { useRevealEntries, useRevealWeek, useWeekEntrants, useWeekScores } from './revealData';
import { useSeasonWeekList } from './standingsData';
import { useWeekTab } from './useWeekTab';
import { WeekTabs } from './WeekTabs';

/**
 * The week, once picks are locked (PROJECT_PLAN Sprint 6): the winner and how it was decided, the
 * leaderboard, and everyone's picks, by player and by game. Before the lock, paid players and the
 * staff see who's in, the games, and the board, but no picks (D-139, CLAUDE.md §4.3, D-021); anyone
 * else sees when picks open up.
 */
export default function WeekPage() {
  const { year = '', weekId = '' } = useParams();
  const session = useGuestSession();
  const week = useRevealWeek(year, weekId, Boolean(session.user));
  const revealed = week.data?.revealed === true;
  const entries = useRevealEntries(year, weekId, revealed && Boolean(session.user));
  const profile = useMyProfile(session.user?.uid);
  const scores = useWeekScores(year, week.data);
  const { isAdmin, isCounter } = useAuth();
  const staff = isAdmin || isCounter;
  const myPlayerId = profile.data?.playerId;
  // Before the lock, the full page is for paid players and the staff (D-139).
  const standing = useBoardStanding(
    year,
    weekId,
    week.data && !revealed && !staff ? (myPlayerId ?? null) : null,
  );
  const paid = standing.data?.paid === true;
  const fullBeforeLock = Boolean(week.data) && !revealed && (staff || paid);
  const entrants = useWeekEntrants(year, weekId, fullBeforeLock);
  const deciding =
    week.data && !revealed && !staff && (profile.isPending || (myPlayerId && standing.isPending));

  const title = week.data ? `Week ${week.data.weekNumber}` : 'This week';
  const navigate = useNavigate();
  const weekList = useSeasonWeekList(year, Boolean(session.user));
  // Every week stays viewable: pick any earlier one (PROJECT_PLAN Sprint 7).
  const picker =
    weekList.data && weekList.data.length > 1 ? (
      <div className="flex items-center justify-center gap-2">
        <label htmlFor="week-jump" className="font-semibold text-ink-inverse">
          Week
        </label>
        <select
          id="week-jump"
          className="field w-auto"
          value={weekId}
          onChange={(e) => navigate(`/week/${year}/${e.target.value}`)}
        >
          {weekList.data.map((w) => (
            <option key={w.id} value={w.id}>
              Week {w.weekNumber}
              {w.status === 'final' ? ' · Final' : w.status === 'open' ? ' · Open' : ''}
            </option>
          ))}
        </select>
      </div>
    ) : null;
  const back = (
    <Link
      to="/"
      className="inline-flex min-h-touch items-center justify-center text-body text-ink-inverse underline"
    >
      Back to this week
    </Link>
  );

  if (session.failed || week.isError || entries.isError) {
    return (
      <GameDayPage title={title}>
        <Panel>
          <p role="alert" className="text-body">
            This week didn't load. Check your signal and refresh.
          </p>
        </Panel>
        {back}
      </GameDayPage>
    );
  }
  if (!session.user || week.isPending || (revealed && entries.isPending) || deciding) {
    return (
      <GameDayPage title={title}>
        <Panel>
          <p role="status" className="text-body">
            Loading…
          </p>
        </Panel>
      </GameDayPage>
    );
  }
  if (!week.data) {
    return (
      <GameDayPage title={title}>
        {picker}
        <Panel>
          <p className="text-body">That week isn't available.</p>
        </Panel>
        {back}
      </GameDayPage>
    );
  }
  if (fullBeforeLock) {
    return (
      <GameDayPage title={title}>
        {picker}
        <BeforeLock week={week.data} entrants={entrants.data} myPlayerId={myPlayerId} />
        {back}
      </GameDayPage>
    );
  }
  if (!revealed) {
    const entered = standing.data?.entered === true;
    return (
      <GameDayPage title={title}>
        {picker}
        <Panel title="Picks are hidden">
          <div className="flex flex-col gap-3">
            <p className="text-body">
              Nobody can see anyone else's picks until they lock,{' '}
              <strong>{formatPoolDateTime(new Date(week.data.lockAtMs))}</strong>. Then everyone's
              picks and the standings show up here.
            </p>
            <p className="text-body">
              {week.data.entryCount} {week.data.entryCount === 1 ? 'player is' : 'players are'} in
              so far.
            </p>
            {entered && (
              <p className="rounded-md bg-surface-muted p-3 text-body">
                Once the pool confirms your payment, you'll see who's in and the board here.
              </p>
            )}
          </div>
        </Panel>
        {!entered && <BoardSection year={year} week={week.data} />}
        {back}
      </GameDayPage>
    );
  }
  return (
    <GameDayPage title={title}>
      {picker}
      <Revealed
        week={week.data}
        entries={entries.data ?? []}
        myPlayerId={myPlayerId}
        feed={{
          scores: scores.data ?? [],
          checkedAtMs: scores.dataUpdatedAt || null,
          failed: scores.isError,
          busy: scores.isFetching || week.isFetching,
          refresh: () => void Promise.all([scores.refetch(), week.refetch()]),
        }}
      />
      <Link
        to={`/sheet/${year}/${weekId}/results`}
        className="inline-flex min-h-touch items-center justify-center text-body text-ink-inverse underline"
      >
        Print these results
      </Link>
      {back}
    </GameDayPage>
  );
}

/** ESPN's scores for the week (D-098): unofficial until the commissioner saves results. */
interface Feed {
  scores: FeedScore[];
  checkedAtMs: number | null;
  failed: boolean;
  busy: boolean;
  refresh: () => void;
}

function Revealed({
  week,
  entries,
  myPlayerId,
  feed,
}: {
  week: WeekView;
  entries: RevealEntry[];
  myPlayerId: string | undefined;
  feed: Feed;
}) {
  const { view, setView, unreadCount } = useWeekTab(week);
  const games = [...week.games].sort((a, b) => a.order - b.order);
  const gameIds = games.map((g) => g.id);
  // A final week is the commissioner's results only; a locked one also counts ESPN's finals.
  const live = week.status === 'locked';
  const { results, unofficial } = live
    ? withUnofficialResults(games, week.results, feed.scores)
    : { results: week.results, unofficial: [] as string[] };
  // Kickoff, live score, or final for each game (D-104). A final week shows only what was saved.
  const statusOf = gameStatuses(games, live ? feed.scores : []);
  const rows = leaderboard(entries, gameIds, results);
  const decided = gameIds.filter((id) => results[id]).length;
  const final = week.status === 'final' && week.winner !== null;
  const winner = final ? week.winner! : null;
  const byId = new Map(entries.map((e) => [e.playerId, e]));
  const myPicks = myPlayerId ? (byId.get(myPlayerId)?.picks ?? null) : null;
  const tied = winner ? winner.tiedPlayerIds.map((id) => byId.get(id)).filter((e) => e) : [];

  // The Monday night tiebreaker under that game (D-105): the saved total first, else the feed's.
  const mnf = games.find((g) => g.id === week.mnfGameId) ?? null;
  const mnfStatus = mnf && live ? statusOf[mnf.id] : null;
  const mnfTotal =
    week.mnfTotal ??
    (mnfStatus?.kind === 'final' || mnfStatus?.kind === 'live'
      ? mnfStatus.awayPoints + mnfStatus.homePoints
      : null);
  const mnfNote =
    week.mnfTotal !== null
      ? 'final'
      : mnfStatus?.kind === 'final'
        ? 'final (unofficial)'
        : mnfStatus?.kind === 'live'
          ? `so far · ${mnfStatus.label}`
          : mnfStatus?.kind === 'upcoming'
            ? `not started. Kickoff ${mnfStatus.label}`
            : (mnfStatus?.label ?? 'not in yet');
  const leaderIds = decided > 0 ? rows.filter((r) => r.rank === 1).map((r) => r.playerId) : [];
  const tiebreak = tiebreakSummary(entries, mnfTotal, myPlayerId, leaderIds);

  return (
    <>
      {winner && (
        <>
          <WinnerBanner weekNumber={week.weekNumber} winner={winner} />
          <Panel title="How this was decided">
            <div className="flex flex-col gap-3 text-body">
              <p>
                {explainOutcome(
                  winner,
                  week.mnfTotal,
                  tied.map((e) => e!.displayName),
                )}
              </p>
              {winner.decision !== 'most_wins' && (
                <ul className="flex flex-col gap-1" aria-label="Tiebreaker guesses">
                  <li>
                    Monday night total: <strong>{week.mnfTotal}</strong>
                  </li>
                  {tied.map((e) => (
                    <li key={e!.playerId}>
                      {e!.displayName} guessed <strong>{e!.tiebreakerTotal ?? 'nothing'}</strong>
                    </li>
                  ))}
                </ul>
              )}
              <p>
                Pot <strong>{formatMoney(winner.potCents)}</strong>:{' '}
                {winner.potCents / week.entryFeeCents} paid{' '}
                {winner.potCents / week.entryFeeCents === 1 ? 'entry' : 'entries'} at{' '}
                {formatMoney(week.entryFeeCents)} each. {entries.length}{' '}
                {entries.length === 1 ? 'player' : 'players'} entered.
              </p>
              {week.correctedAtMs !== null && (
                <p className="rounded-md bg-gold-50 p-3 text-gold-800">
                  <span aria-hidden="true">ⓘ </span>
                  <strong>Result corrected</strong> on{' '}
                  {formatPoolDateTime(new Date(week.correctedAtMs), { weekday: 'short' })}. What you
                  see here is after the correction.
                </p>
              )}
            </div>
          </Panel>
        </>
      )}

      {!winner && (
        <Panel title="Picks are locked">
          <div className="flex flex-col gap-3 text-body">
            <p>
              {decided === 0
                ? 'No results yet. The standings fill in as the games finish.'
                : `${decided} of ${gameIds.length} games decided.`}{' '}
              {week.entryCount} {week.entryCount === 1 ? 'player' : 'players'} in. Pot{' '}
              <strong>{formatMoney(week.paidCount * week.entryFeeCents)}</strong> so far.
            </p>
            {live && (
              <>
                {unofficial.length > 0 && (
                  <p className="rounded-md bg-gold-50 p-3 text-gold-800">
                    <span aria-hidden="true">ⓘ </span>
                    <strong>
                      {unofficial.length} {unofficial.length === 1 ? 'game is' : 'games are'}{' '}
                      unofficial.
                    </strong>{' '}
                    {unofficial.length === 1 ? 'Its score comes' : 'Their scores come'} from ESPN
                    and count in the standings until the commissioner confirms the results.
                  </p>
                )}
                <p role="status" className="text-body-sm text-ink-muted">
                  {feed.busy
                    ? 'Checking the scores…'
                    : feed.failed
                      ? "Couldn't get scores from ESPN just now. The standings show the results the commissioner has saved."
                      : feed.checkedAtMs
                        ? `Scores checked ${formatPoolDateTime(new Date(feed.checkedAtMs), { weekday: 'short' })}.`
                        : null}
                </p>
                <Button variant="secondary" disabled={feed.busy} onClick={feed.refresh}>
                  {feed.busy ? 'Checking…' : 'Refresh scores'}
                </Button>
              </>
            )}
          </div>
        </Panel>
      )}

      {week.backfilled && (
        <p className="rounded-md bg-surface p-3 text-body">
          <span aria-hidden="true">ⓘ </span>
          This week was played before the pool moved online. Its picks were entered from the paper
          sheets afterwards.
        </p>
      )}

      <WeekTabs view={view} setView={setView} unreadCount={unreadCount} />

      {view === 'board' ? (
        <>
          <BoardSection year={week.year} week={week} />
          <EarlierBoards year={week.year} week={week} />
        </>
      ) : entries.length === 0 ? (
        <Panel>
          <p className="text-body">Nobody entered this week.</p>
        </Panel>
      ) : view === 'standings' ? (
        <ol className="flex flex-col gap-2" aria-label="Standings">
          {rows.map((row) => (
            <LeaderboardRow
              key={row.playerId}
              rankLabel={rankLabel(row)}
              name={row.displayName}
              wins={row.wins}
              losses={row.losses}
              bestPossible={row.remaining > 0 && decided > 0 ? row.bestPossible : undefined}
              you={row.playerId === myPlayerId}
              winner={winner?.playerIds.includes(row.playerId)}
              late={row.late}
            >
              <PlayerPicks row={row} week={week} results={results} unofficial={unofficial} />
            </LeaderboardRow>
          ))}
        </ol>
      ) : (
        <ol className="flex flex-col gap-2" aria-label="Games">
          {games.map((g) => {
            const share = gameShare(g.id, entries);
            const result = results[g.id];
            const line = shareLine(g, share, result);
            const status = statusOf[g.id];
            return (
              <li key={g.id} className="flex flex-col gap-2 rounded-md bg-surface p-3">
                <ShareBar
                  awayTeam={g.away}
                  homeTeam={g.home}
                  awayCount={share.away.length}
                  homeCount={share.home.length}
                  awayPercent={sharePercent(share.away.length, share.total)}
                  homePercent={sharePercent(share.home.length, share.total)}
                  winner={result === 'away' || result === 'home' ? result : null}
                  status={live ? status : null}
                  unofficial={unofficial.includes(g.id)}
                  myPick={myPicks?.[g.id] ?? null}
                  upset={isUpset(share, result)}
                />
                <WhoPicked line={line} gameId={g.id}>
                  <p>
                    <strong>{g.away}:</strong> {share.away.join(', ') || 'nobody'}
                  </p>
                  <p>
                    <strong>{g.home}:</strong> {share.home.join(', ') || 'nobody'}
                  </p>
                  {share.blank.length > 0 && (
                    <p>
                      <strong>No pick:</strong> {share.blank.join(', ')}
                    </p>
                  )}
                </WhoPicked>
                {g.id === mnf?.id && (
                  <TiebreakerPanel total={mnfTotal} totalNote={mnfNote} summary={tiebreak} />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

/**
 * The upset or tie line on the left and "Who picked what" on the right, on one row to save a line
 * per card (D-107); the names open below. With large text the button drops under the line.
 */
function WhoPicked({
  line,
  gameId,
  children,
}: {
  line: string | null;
  gameId: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = `who-picked-${gameId}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        {line && <p className="min-w-0 flex-[1_1_9rem] text-body">{line}</p>}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          className="ml-auto min-h-touch whitespace-nowrap py-2 text-body font-semibold text-ink-emphasis underline"
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden="true">{open ? '▾ ' : '▸ '}</span>
          Who picked what
        </button>
      </div>
      {/* The class hides it too: `flex` would otherwise override the hidden attribute. */}
      <div
        id={panelId}
        hidden={!open}
        className={open ? 'flex flex-col gap-2 text-body' : 'hidden'}
      >
        {children}
      </div>
    </div>
  );
}

function PlayerPicks({
  row,
  week,
  results,
  unofficial,
}: {
  row: Row;
  week: WeekView;
  results: WeekView['results'];
  unofficial: string[];
}) {
  const games = [...week.games].sort((a, b) => a.order - b.order);
  return (
    <div className="flex flex-col gap-2 text-body">
      <ul className="flex flex-col gap-1">
        {games.map((g) => {
          const pick = row.picks[g.id];
          const mark = pickMark(pick, results[g.id]);
          const { icon } = PICK_MARK_TEXT[mark];
          const label =
            PICK_MARK_TEXT[mark].label + (unofficial.includes(g.id) ? ' (unofficial)' : '');
          const team = pick === 'away' ? g.away : pick === 'home' ? g.home : null;
          return (
            <li key={g.id} className="flex items-baseline justify-between gap-2">
              <span>
                {team ? (
                  <>
                    <strong>{team}</strong>
                    <span className="text-ink-muted">
                      {' '}
                      over {pick === 'away' ? g.home : g.away}
                    </span>
                  </>
                ) : (
                  <span className="text-ink-muted">
                    {g.away} at {g.home}
                  </span>
                )}
              </span>
              <span
                className={`flex-none ${
                  mark === 'correct'
                    ? 'text-success-800'
                    : mark === 'missed'
                      ? 'text-ink-urgent'
                      : 'text-ink-muted'
                }`}
              >
                <span aria-hidden="true">{icon} </span>
                {label}
              </span>
            </li>
          );
        })}
      </ul>
      <p>
        <strong>Tiebreaker guess:</strong> {row.tiebreakerTotal ?? 'none'}
      </p>
      <p className="text-body-sm text-ink-muted">
        Submitted {formatPoolDateTime(new Date(row.submittedAtMs), { weekday: 'short' })}
        {row.late ? '. Late entry, approved by the pool.' : '.'}
      </p>
    </div>
  );
}
