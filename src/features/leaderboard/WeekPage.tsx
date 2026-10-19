import { useState } from 'react';
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
import { finalScores, withUnofficialResults, type FeedScore } from '@shared/schedule';
import { explainOutcome, formatMoney } from '@shared/scoring';
import { formatPoolDateTime } from '@shared/time';
import { Button } from '../../components/ui/Button';
import { GameDayPage } from '../../components/layout/GameDayPage';
import { LeaderboardRow } from '../../components/ui/LeaderboardRow';
import { Panel } from '../../components/ui/Panel';
import { ShareBar } from '../../components/ui/ShareBar';
import { WinnerBanner } from '../../components/ui/WinnerBanner';
import type { WeekView } from '../../lib/weekModel';
import { useGuestSession } from '../auth/useAuth';
import { BoardSection } from '../board/BoardSection';
import { useMyProfile } from '../claims/claimsData';
import { useRevealEntries, useRevealWeek, useWeekScores } from './revealData';
import { useSeasonWeekList } from './standingsData';

type View = 'standings' | 'games' | 'board';

/**
 * The week, once picks are locked (PROJECT_PLAN Sprint 6): the winner and how it was decided, the
 * leaderboard, and everyone's picks, by player and by game. Before the lock it shows nothing but
 * when picks open up (CLAUDE.md §4.3, D-021).
 */
export default function WeekPage() {
  const { year = '', weekId = '' } = useParams();
  const session = useGuestSession();
  const week = useRevealWeek(year, weekId, Boolean(session.user));
  const revealed = week.data?.revealed === true;
  const entries = useRevealEntries(year, weekId, revealed && Boolean(session.user));
  const profile = useMyProfile(session.user?.uid);
  const scores = useWeekScores(year, week.data);

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
  if (!session.user || week.isPending || (revealed && entries.isPending)) {
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
  if (!revealed) {
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
          </div>
        </Panel>
        <BoardSection year={year} week={week.data} />
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
        myPlayerId={profile.data?.playerId}
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
  const [view, setView] = useState<View>('standings');
  const games = [...week.games].sort((a, b) => a.order - b.order);
  const gameIds = games.map((g) => g.id);
  // A final week is the commissioner's results only; a locked one also counts ESPN's finals.
  const live = week.status === 'locked';
  const { results, unofficial } = live
    ? withUnofficialResults(games, week.results, feed.scores)
    : { results: week.results, unofficial: [] as string[] };
  const scoreOf = finalScores(games, live ? feed.scores : []);
  const rows = leaderboard(entries, gameIds, results);
  const decided = gameIds.filter((id) => results[id]).length;
  const final = week.status === 'final' && week.winner !== null;
  const winner = final ? week.winner! : null;
  const byId = new Map(entries.map((e) => [e.playerId, e]));
  const myPicks = myPlayerId ? (byId.get(myPlayerId)?.picks ?? null) : null;
  const tied = winner ? winner.tiedPlayerIds.map((id) => byId.get(id)).filter((e) => e) : [];

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

      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {(
          [
            ['standings', 'Standings'],
            ['games', 'By game'],
            ['board', 'Board'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => setView(value)}
            className="min-h-touch min-w-[6rem] flex-1 rounded-pill border-2 border-white bg-black/30 px-3 font-heading text-h3 text-ink-inverse aria-pressed:bg-white aria-pressed:text-purple-700"
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'board' ? (
        <BoardSection year={week.year} week={week} />
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
            const score = scoreOf[g.id];
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
                  score={score ? { away: score.awayPoints, home: score.homePoints } : null}
                  unofficial={unofficial.includes(g.id)}
                  myPick={myPicks?.[g.id] ?? null}
                  upset={isUpset(share, result)}
                />
                {line && <p className="text-body">{line}</p>}
                <details>
                  <summary className="min-h-touch cursor-pointer py-2 text-body font-semibold text-ink-emphasis underline">
                    Who picked what
                  </summary>
                  <div className="flex flex-col gap-2 text-body">
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
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      )}
    </>
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
