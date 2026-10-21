import type { WeekView } from '../../lib/weekModel';
import { useAuth } from '../auth/useAuth';
import { useSeasonWeekList } from '../leaderboard/standingsData';
import { Panel } from '../../components/ui/Panel';
import { BoardDisclosure } from './BoardDisclosure';
import { BoardSection } from './BoardSection';
import { useBoardJoin, useMyEnteredWeeks } from './boardData';

/**
 * Earlier weeks' boards under this week's (D-139), newest first, each closed until tapped. Only
 * the weeks you entered, since those are the boards the rules let you read; the staff see them all.
 */
export function EarlierBoards({ year, week }: { year: string; week: WeekView }) {
  const { user, isAdmin, isCounter } = useAuth();
  const staff = isAdmin || isCounter;
  const weeks = useSeasonWeekList(year, Boolean(user));
  const join = useBoardJoin(user?.uid);
  const playerId = join.data ?? null;
  // The list comes newest first already (standingsData).
  const earlier = (weeks.data ?? []).filter((w) => w.weekNumber < week.weekNumber);
  const entered = useMyEnteredWeeks(
    year,
    staff ? null : playerId,
    earlier.map((w) => w.id),
  );
  const shown = staff ? earlier : earlier.filter((w) => entered.data?.includes(w.id));
  if (shown.length === 0) return null;
  return (
    <Panel title="Earlier weeks">
      <ol className="flex flex-col gap-2" aria-label="Earlier weeks' boards">
        {shown.map((w) => (
          <BoardDisclosure key={w.id} label={`Week ${w.weekNumber} board`}>
            <BoardSection year={year} week={w} bare />
          </BoardDisclosure>
        ))}
      </ol>
    </Panel>
  );
}
