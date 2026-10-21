import type { WeekTab } from './useWeekTab';

/** Standings, By game, Board: the same three before and after the lock (D-139). */
export function WeekTabs({
  view,
  setView,
  unreadCount,
}: {
  view: WeekTab;
  setView: (v: WeekTab) => void;
  unreadCount: number;
}) {
  return (
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
          {value === 'board' && view !== 'board' && unreadCount > 0 && (
            <span className="badge badge-pending ml-2 align-middle">{unreadCount} new</span>
          )}
        </button>
      ))}
    </div>
  );
}
