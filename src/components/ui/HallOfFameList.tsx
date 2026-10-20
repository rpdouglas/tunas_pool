import { Link } from 'react-router-dom';
import type { HallList } from '@shared/hallOfFame';
import { Panel } from './Panel';

export interface HallOfFameListProps {
  list: HallList;
  /** The person looking, to mark their row "You". */
  myPlayerId?: string | null;
}

/**
 * One record on the Hall of Fame (D-108): its title, what it counts, and the top five places, each
 * a link to the player. Tied players share a place, said in words ("Tied 2"); "You" is a word too,
 * never colour alone. When text is large the record drops under the name instead of squeezing it.
 */
export function HallOfFameList({ list, myPlayerId }: HallOfFameListProps) {
  return (
    <Panel title={list.title}>
      <div className="flex flex-col gap-3">
        <p className="text-body text-ink-muted">{list.about}</p>
        {list.entries.length === 0 ? (
          <p className="text-body">{list.empty}</p>
        ) : (
          <ol className="flex flex-col gap-2" aria-label={list.title}>
            {list.entries.map((e) => (
              <li key={e.playerId}>
                <Link
                  to={`/player/${e.playerId}`}
                  className={`flex min-h-touch flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border-2 bg-surface px-3 py-2 ${
                    e.playerId === myPlayerId ? 'border-line-strong' : 'border-line-subtle'
                  }`}
                >
                  <span className="flex min-w-0 flex-[1_1_8rem] flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="w-14 flex-none text-body-sm text-ink-muted">
                      {e.tied ? `Tied ${e.place}` : e.place}
                    </span>
                    <span className="min-w-0 break-words font-heading text-h3">
                      {e.displayName}
                    </span>
                    {e.playerId === myPlayerId && <span className="badge badge-open">You</span>}
                  </span>
                  <span className="ml-auto text-right text-body">
                    <strong>{e.value}</strong>
                    {e.detail && (
                      <span className="block text-body-sm text-ink-muted">{e.detail}</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
        {list.more && <p className="text-body">{list.more}</p>}
      </div>
    </Panel>
  );
}
