import { Link } from 'react-router-dom';
import { hallOfFame } from '@shared/hallOfFame';
import { GameDayPage } from '../../components/layout/GameDayPage';
import { HallOfFameList } from '../../components/ui/HallOfFameList';
import { Panel } from '../../components/ui/Panel';
import { useGuestSession } from '../auth/useAuth';
import { useMyProfile } from '../claims/claimsData';
import { useHallOfFameSeasons } from './standingsData';

/**
 * The Hall of Fame (D-108): all-time records across every season, from the season standings.
 * Records to be proud of, never a chase: no streaks (D-023), no money, and no worst records.
 */
export default function HallOfFamePage() {
  const session = useGuestSession();
  const seasons = useHallOfFameSeasons(Boolean(session.user));
  const profile = useMyProfile(session.user?.uid);
  const years = (seasons.data ?? [])
    .filter((s) => s.rows.length > 0)
    .map((s) => s.year)
    .sort();

  return (
    <GameDayPage title="Hall of Fame">
      {session.failed || seasons.isError ? (
        <Panel>
          <p role="alert" className="text-body">
            The Hall of Fame didn't load. Check your signal and refresh.
          </p>
        </Panel>
      ) : !session.user || seasons.isPending ? (
        <Panel>
          <p role="status" className="text-body">
            Loading…
          </p>
        </Panel>
      ) : (
        <>
          <Panel>
            <p className="text-body">
              The pool's records
              {years.length > 0 &&
                (years.length === 1
                  ? `, from the ${years[0]} season`
                  : `, from ${years[0]} to ${years[years.length - 1]}`)}
              . Finished weeks count, for players on the season standings.
            </p>
          </Panel>
          {hallOfFame(seasons.data).map((list) => (
            <HallOfFameList key={list.key} list={list} myPlayerId={profile.data?.playerId} />
          ))}
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
