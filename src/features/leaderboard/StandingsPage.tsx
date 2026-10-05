import { Link } from 'react-router-dom';
import { formatRecord } from '@shared/scoring';
import { standingPlaces, winPercent } from '@shared/standings';
import { GameDayPage } from '../../components/layout/GameDayPage';
import { Panel } from '../../components/ui/Panel';
import { currentSeason } from '../../lib/season';
import { useGuestSession } from '../auth/useAuth';
import { useMyProfile } from '../claims/claimsData';
import { useStandings } from './standingsData';

/**
 * The season standings (PROJECT_PLAN Sprint 7): total correct picks across the weeks that are
 * final. A record, not a chase: no streaks (D-023), no "games back", and every week is still its
 * own pot (PERSONAS: the Slump rule).
 */
export default function StandingsPage() {
  const session = useGuestSession();
  const year = currentSeason();
  const standings = useStandings(year, Boolean(session.user));
  const profile = useMyProfile(session.user?.uid);
  const rows = standings.data ?? [];
  const places = standingPlaces(rows);
  const mine = profile.data?.playerId;
  const onIt = rows.some((r) => r.playerId === mine);

  return (
    <GameDayPage title={`${year} season`}>
      {session.failed || standings.isError ? (
        <Panel>
          <p role="alert" className="text-body">
            The standings didn't load. Check your signal and refresh.
          </p>
        </Panel>
      ) : !session.user || standings.isPending ? (
        <Panel>
          <p role="status" className="text-body">
            Loading…
          </p>
        </Panel>
      ) : rows.length === 0 ? (
        <Panel title="Season standings">
          <p className="text-body">
            No weeks are final yet. The standings start once the first winner is announced.
          </p>
        </Panel>
      ) : (
        <Panel title="Season standings">
          <div className="flex flex-col gap-3">
            <p className="text-body">
              Correct picks across every finished week. Each week is still its own pot, so anyone
              can win the next one.
            </p>
            <ol className="flex flex-col gap-2" aria-label="Season standings">
              {rows.map((row, i) => (
                <li key={row.playerId}>
                  <Link
                    to={`/player/${row.playerId}`}
                    className={`flex min-h-touch items-center justify-between gap-2 rounded-md border-2 bg-surface px-3 py-2 ${
                      row.playerId === mine ? 'border-line-strong' : 'border-line-subtle'
                    }`}
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="w-14 flex-none text-body-sm text-ink-muted">
                        {places[i].tied ? `Tied ${places[i].place}` : places[i].place}
                      </span>
                      <span className="min-w-0 break-words font-heading text-h3">
                        {row.displayName}
                      </span>
                      {row.playerId === mine && <span className="badge badge-open">You</span>}
                    </span>
                    <span className="flex-none text-right text-body">
                      <strong>{formatRecord(row.wins, row.losses)}</strong>
                      <span className="block text-body-sm text-ink-muted">
                        {winPercent(row)} · {row.weeksPlayed}{' '}
                        {row.weeksPlayed === 1 ? 'week' : 'weeks'}
                        {row.weeklyTitles > 0 &&
                          ` · ${row.weeklyTitles} ${row.weeklyTitles === 1 ? 'win' : 'wins'}`}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </Panel>
      )}

      {session.user?.isAnonymous && !onIt && !profile.data?.linkedToRoster && (
        <Panel title="Track your season">
          <div className="flex flex-col gap-3">
            <p className="text-body">
              You're playing as a guest, so you show up week by week but not here. Save your picks
              to an email and your season record starts counting.
            </p>
            <Link to="/account" className="btn btn-primary">
              Save your picks and track your season
            </Link>
          </div>
        </Panel>
      )}

      <Link
        to="/"
        className="inline-flex min-h-touch items-center justify-center text-body text-ink-inverse underline"
      >
        Back to this week
      </Link>
    </GameDayPage>
  );
}
