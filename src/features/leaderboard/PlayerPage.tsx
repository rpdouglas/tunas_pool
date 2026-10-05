import { Link, useParams } from 'react-router-dom';
import { formatRecord } from '@shared/scoring';
import { bestWeek, winPercent } from '@shared/standings';
import { GameDayPage } from '../../components/layout/GameDayPage';
import { Panel } from '../../components/ui/Panel';
import { StatTile } from '../../components/ui/StatTile';
import { currentSeason } from '../../lib/season';
import { useGuestSession } from '../auth/useAuth';
import { usePlayerStanding } from './standingsData';

const weekNumber = (weekId: string) => Number(weekId.replace(/\D/g, ''));

/**
 * One player's season (PROJECT_PLAN Sprint 7): the name they play under and their record. Nothing
 * else about them is here or readable: no phone, email, or payment (CLAUDE.md §8). No streaks (D-023).
 */
export default function PlayerPage() {
  const { playerId = '' } = useParams();
  const session = useGuestSession();
  const year = currentSeason();
  const standing = usePlayerStanding(year, playerId, Boolean(session.user));
  const row = standing.data;
  const best = row ? bestWeek(row.weekRecords) : null;
  const weeks = row
    ? Object.entries(row.weekRecords).sort(([a], [b]) => weekNumber(b) - weekNumber(a))
    : [];

  return (
    <GameDayPage title={row?.displayName ?? 'Player'}>
      {session.failed || standing.isError ? (
        <Panel>
          <p role="alert" className="text-body">
            This page didn't load. Check your signal and refresh.
          </p>
        </Panel>
      ) : !session.user || standing.isPending ? (
        <Panel>
          <p role="status" className="text-body">
            Loading…
          </p>
        </Panel>
      ) : !row ? (
        <Panel>
          <p className="text-body">
            This player isn't on the {year} season standings yet. Standings count finished weeks.
          </p>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Season" value={formatRecord(row.wins, row.losses)} compact />
            <StatTile label="Correct" value={winPercent(row)} compact />
            <StatTile label="Weeks played" value={String(row.weeksPlayed)} compact />
            <StatTile label="Weeks won" value={String(row.weeklyTitles)} compact accent />
          </div>
          <Panel title={`${year} weeks`}>
            <div className="flex flex-col gap-3">
              {best && (
                <p className="text-body">
                  Best week: <strong>{formatRecord(best.wins, best.losses)}</strong> in week{' '}
                  {weekNumber(best.weekId)}.
                </p>
              )}
              <ul className="flex flex-col divide-y divide-line-subtle" aria-label="Weeks">
                {weeks.map(([weekId, r]) => (
                  <li key={weekId}>
                    <Link
                      to={`/week/${year}/${weekId}`}
                      className="flex min-h-touch items-center justify-between gap-2 py-1 text-body"
                    >
                      <span className="underline">Week {weekNumber(weekId)}</span>
                      <strong>{formatRecord(r.wins, r.losses)}</strong>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        </>
      )}
      <Link
        to="/standings"
        className="inline-flex min-h-touch items-center justify-center text-body text-ink-inverse underline"
      >
        Season standings
      </Link>
    </GameDayPage>
  );
}
