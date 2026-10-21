import { useEffect, useState } from 'react';
import type { WeekView } from '../../lib/weekModel';
import { useBoardUnread } from '../board/boardData';

export type WeekTab = 'standings' | 'games' | 'board';

/** Which tab is showing, and the board's unread count, marked seen while the board is open. */
export function useWeekTab(week: WeekView) {
  const [view, setView] = useState<WeekTab>('standings');
  const unread = useBoardUnread(week.year, week);
  const { markSeen } = unread;
  // Open on the board: everything on it is seen, including posts that arrive while it is open.
  useEffect(() => {
    if (view === 'board') markSeen();
  }, [view, markSeen]);
  return { view, setView, unreadCount: unread.count };
}
