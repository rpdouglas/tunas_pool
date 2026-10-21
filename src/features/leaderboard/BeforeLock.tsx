import { Link } from 'react-router-dom';
import { formatMoney } from '@shared/scoring';
import { formatPoolDateTime } from '@shared/time';
import { kickoffLabel } from '@shared/weeks';
import { Panel } from '../../components/ui/Panel';
import type { WeekView } from '../../lib/weekModel';
import { BoardSection } from '../board/BoardSection';
import { EarlierBoards } from '../board/EarlierBoards';
import type { Entrant } from './revealData';
import { useWeekTab } from './useWeekTab';
import { WeekTabs } from './WeekTabs';

/**
 * The week before the lock, for paid players and the staff (D-139): who's in, the games, and the
 * board. No picks and nothing counted from them until the lock (CLAUDE.md §4.3, D-021).
 */
export function BeforeLock({
  week,
  entrants,
  myPlayerId,
}: {
  week: WeekView;
  entrants: Entrant[] | undefined;
  myPlayerId: string | undefined;
}) {
  const { view, setView, unreadCount } = useWeekTab(week);
  return (
    <>
      <Panel title="Picks are hidden">
        <div className="flex flex-col gap-3 text-body">
          <p>
            Nobody can see anyone else's picks until they lock,{' '}
            <strong>{formatPoolDateTime(new Date(week.lockAtMs))}</strong>.
          </p>
          <p>
            {week.entryCount} {week.entryCount === 1 ? 'player' : 'players'} in. Pot{' '}
            <strong>{formatMoney(week.paidCount * week.entryFeeCents)}</strong> so far.
          </p>
          {myPlayerId && (
            <Link to={`/picks/${week.year}/${week.id}`} className="underline">
              See or edit your picks
            </Link>
          )}
        </div>
      </Panel>

      <WeekTabs view={view} setView={setView} unreadCount={unreadCount} />

      {view === 'board' ? (
        <>
          <BoardSection year={week.year} week={week} />
          <EarlierBoards year={week.year} week={week} />
        </>
      ) : view === 'standings' ? (
        entrants === undefined ? (
          <Panel>
            <p role="status" className="text-body">
              Loading…
            </p>
          </Panel>
        ) : (
          <WhoIsIn entrants={entrants} myPlayerId={myPlayerId} />
        )
      ) : (
        <GamesBeforeLock week={week} />
      )}
    </>
  );
}

/** Who's in so far, A to Z. Names only: payments are private (D-036). */
export function WhoIsIn({
  entrants,
  myPlayerId,
}: {
  entrants: Entrant[];
  myPlayerId: string | undefined;
}) {
  return (
    <Panel title="Who's in so far">
      {entrants.length === 0 ? (
        <p className="text-body">Nobody yet.</p>
      ) : (
        <div className="flex flex-col gap-3 text-body">
          <ol className="flex flex-col gap-1" aria-label="Who's in">
            {entrants.map((e) => (
              <li key={e.playerId}>
                {e.displayName}
                {e.playerId === myPlayerId && <strong> (you)</strong>}
              </li>
            ))}
          </ol>
          <p className="text-ink-muted">The standings start once picks lock.</p>
        </div>
      )}
    </Panel>
  );
}

/** The games and their kickoffs. Who picked what waits for the lock (D-021). */
export function GamesBeforeLock({ week }: { week: Pick<WeekView, 'games' | 'mnfGameId'> }) {
  const games = [...week.games].sort((a, b) => a.order - b.order);
  return (
    <Panel title="The games">
      <div className="flex flex-col gap-3 text-body">
        <p className="text-ink-muted">Who picked what shows here once picks lock.</p>
        <ol className="flex flex-col gap-2" aria-label="Games">
          {games.map((g) => (
            <li
              key={g.id}
              className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-md bg-surface-muted p-3"
            >
              <span>
                <strong>{g.away}</strong> at <strong>{g.home}</strong>
                {g.id === week.mnfGameId && (
                  <span className="text-ink-muted"> · Monday night, the tiebreaker</span>
                )}
              </span>
              <span className="text-ink-muted">{kickoffLabel(g)}</span>
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}
