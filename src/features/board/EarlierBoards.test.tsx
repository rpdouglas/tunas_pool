import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WeekView } from '../../lib/weekModel';
import { EarlierBoards } from './EarlierBoards';

let staff = false;
const enteredFor = vi.fn();

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, isAdmin: staff, isCounter: false }),
}));
vi.mock('../leaderboard/standingsData', () => ({
  // Newest first, as the real list comes.
  useSeasonWeekList: () => ({
    data: [4, 3, 2, 1].map((n) => ({ id: `wk0${n}`, weekNumber: n })),
  }),
}));
vi.mock('./boardData', () => ({
  useBoardJoin: () => ({ data: 'lou' }),
  useMyEnteredWeeks: (_y: string, playerId: string | null, weekIds: string[]) => {
    enteredFor(playerId, weekIds);
    return { data: playerId ? ['wk01', 'wk03'] : undefined };
  },
}));
vi.mock('./BoardSection', () => ({
  BoardSection: ({ week }: { week: WeekView }) => <p>Posts for {week.id}</p>,
}));

const CURRENT = { id: 'wk04', weekNumber: 4 } as WeekView;

beforeEach(() => {
  staff = false;
  enteredFor.mockReset();
});

it('lists only the earlier weeks you entered, newest first, closed until opened', async () => {
  render(<EarlierBoards year="2026" week={CURRENT} />);
  expect(enteredFor).toHaveBeenCalledWith('lou', ['wk03', 'wk02', 'wk01']);
  const rows = within(screen.getByRole('list', { name: "Earlier weeks' boards" })).getAllByRole(
    'button',
  );
  expect(rows.map((b) => b.textContent)).toEqual(['▸Week 3 board', '▸Week 1 board']);
  expect(rows[0]).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText(/Posts for/)).toBeNull();

  await userEvent.click(rows[0]);
  expect(rows[0]).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('Posts for wk03')).toBeInTheDocument();
  expect(screen.queryByText('Posts for wk01')).toBeNull();
});

it('shows the staff every earlier week', () => {
  staff = true;
  render(<EarlierBoards year="2026" week={CURRENT} />);
  expect(screen.getAllByRole('button')).toHaveLength(3);
});

it('shows nothing in week 1', () => {
  render(<EarlierBoards year="2026" week={{ id: 'wk01', weekNumber: 1 } as WeekView} />);
  expect(screen.queryByText('Earlier weeks')).toBeNull();
});
