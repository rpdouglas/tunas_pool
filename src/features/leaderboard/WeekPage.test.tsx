import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import WeekPage from './WeekPage';

const refetchScores = vi.fn();
const refetchWeek = vi.fn();
let feedFailed = false;

const LOCKED = {
  id: 'wk06',
  year: '2026',
  weekNumber: 6,
  status: 'locked',
  lockAtMs: 0,
  revealed: true,
  games: [
    { id: 'g01', order: 1, away: 'Texans', home: 'Jaguars', kickoffMs: 0, slot: 'sunday' },
    { id: 'g02', order: 2, away: 'Bears', home: 'Falcons', kickoffMs: 0, slot: 'sunday' },
    { id: 'mnf', order: 15, away: 'Commanders', home: '49ers', kickoffMs: 0, slot: 'mnf' },
  ],
  mnfGameId: 'mnf',
  entryFeeCents: 2000,
  entryCount: 2,
  paidCount: 2,
  // The commissioner has saved one game; ESPN has the second as final too.
  results: { g01: 'home' },
  mnfTotal: null,
  winner: null,
  payoutSent: false,
  backfilled: false,
  correctedAtMs: null,
};
let WEEK: Omit<typeof LOCKED, 'results'> & { results: Record<string, string> } = LOCKED;
// The same week before the lock (D-139): open, nothing revealed, nothing decided.
const OPEN = {
  ...LOCKED,
  status: 'open',
  lockAtMs: Date.UTC(2026, 9, 18, 17),
  revealed: false,
  results: {},
};
let standing: { entered: boolean; paid: boolean; muted: boolean } | undefined;
let staff = false;
const entriesRead = vi.fn();

vi.mock('../auth/useAuth', () => ({
  useGuestSession: () => ({ user: { uid: 'u1' }, failed: false }),
  useAuth: () => ({ isAdmin: staff, isCounter: false }),
}));
vi.mock('../claims/claimsData', () => ({
  useMyProfile: () => ({ isPending: false, data: { playerId: 'lou' } }),
}));
vi.mock('./standingsData', () => ({ useSeasonWeekList: () => ({ data: [] }) }));
let unreadPosts = 0;
const markSeen = vi.fn();
vi.mock('../board/boardData', () => ({
  useBoardUnread: () => ({ count: unreadPosts, markSeen }),
  useBoardStanding: (_y: string, _w: string, playerId: string | null) => ({
    isPending: false,
    data: playerId ? standing : undefined,
  }),
}));
vi.mock('../board/EarlierBoards', () => ({
  EarlierBoards: () => <section aria-label="Earlier weeks">Earlier boards</section>,
}));
vi.mock('../board/BoardSection', () => ({
  BoardSection: () => <section aria-label="Board">The board</section>,
}));
vi.mock('../../components/layout/GameDayPage', () => ({
  GameDayPage: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('./revealData', () => ({
  useRevealWeek: () => ({
    isPending: false,
    isError: false,
    isFetching: false,
    data: WEEK,
    refetch: refetchWeek,
  }),
  useWeekEntrants: (_y: string, _w: string, enabled: boolean) => ({
    data: enabled
      ? [
          { playerId: 'lou', displayName: 'Lou' },
          { playerId: 'pat', displayName: 'Pat' },
        ]
      : undefined,
  }),
  useRevealEntries: (_y: string, _w: string, enabled: boolean) => {
    if (enabled) entriesRead();
    return {
      isPending: false,
      isError: false,
      data: [
        {
          playerId: 'pat',
          displayName: 'Pat',
          picks: { g01: 'home', g02: 'home', mnf: 'home' },
          tiebreakerTotal: 40,
          submittedAtMs: 0,
          late: false,
        },
        {
          playerId: 'lou',
          displayName: 'Lou',
          picks: { g01: 'away', g02: 'away', mnf: 'home' },
          tiebreakerTotal: 44,
          submittedAtMs: 0,
          late: false,
        },
      ],
    };
  },
  useWeekScores: () => ({
    data: feedFailed
      ? undefined
      : [
          // Feed says g01 went the other way: the commissioner's saved result must win.
          { away: 'Texans', home: 'Jaguars', final: true, awayPoints: 27, homePoints: 20 },
          { away: 'Bears', home: 'Falcons', final: true, awayPoints: 14, homePoints: 21 },
          { away: 'Commanders', home: '49ers', final: false, awayPoints: 3, homePoints: 0 },
        ],
    dataUpdatedAt: feedFailed ? 0 : Date.UTC(2026, 9, 18, 21, 5),
    isError: feedFailed,
    isFetching: false,
    refetch: refetchScores,
  }),
}));

function show() {
  render(
    <MemoryRouter initialEntries={['/week/2026/wk06']}>
      <Routes>
        <Route path="/week/:year/:weekId" element={<WeekPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  WEEK = LOCKED;
  standing = undefined;
  staff = false;
  entriesRead.mockReset();
  feedFailed = false;
  refetchScores.mockReset();
  refetchWeek.mockReset();
});

it('counts ESPN finals as unofficial, keeps saved results, and refreshes on request', async () => {
  show();
  expect(screen.getByText('2 of 3 games decided.', { exact: false })).toBeInTheDocument();
  expect(screen.getByText('1 game is unofficial.')).toBeInTheDocument();

  // Pat has both games right (g01 saved, g02 from ESPN); Lou has neither.
  const standings = screen.getByRole('list', { name: 'Standings' });
  expect(within(standings).getAllByRole('listitem')[0]).toHaveTextContent('Pat');
  expect(within(standings).getAllByText(/Right \(unofficial\)/).length).toBeGreaterThan(0);

  await userEvent.click(screen.getByRole('button', { name: 'Refresh scores' }));
  expect(refetchScores).toHaveBeenCalled();
  expect(refetchWeek).toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: 'By game' }));
  // Scoreboard cards (D-103): each score beside its team, and "Final (unofficial)" for a feed result.
  const bears = screen
    .getAllByRole('listitem')
    .find((li) => li.textContent?.includes('Bears') && li.textContent.includes('Falcons'))!;
  expect(within(bears).getByText('14')).toBeInTheDocument();
  expect(within(bears).getByText('21')).toBeInTheDocument();
  expect(within(bears).getByText(/Final/)).toHaveTextContent('Final (unofficial)');

  // "Who picked what" sits on the line's row and opens the names below it (D-107).
  const toggle = within(bears).getByRole('button', { name: /Who picked what/ });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const names = document.getElementById(toggle.getAttribute('aria-controls')!)!;
  expect(names).not.toBeVisible();
  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(names).toBeVisible();
  expect(names).toHaveTextContent('Bears:');
});

it('says how many posts are new on the Board tab, and marks them seen when it opens (D-109)', async () => {
  unreadPosts = 3;
  show();
  const tab = screen.getByRole('button', { name: /Board/ });
  expect(tab).toHaveTextContent('Board3 new');
  expect(markSeen).not.toHaveBeenCalled();
  await userEvent.click(tab);
  expect(markSeen).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: /Board/ })).toHaveTextContent(/^Board$/);
  unreadPosts = 0;
});

it('falls back to the saved results when ESPN cannot be reached', () => {
  feedFailed = true;
  show();
  expect(screen.getByText(/Couldn't get scores from ESPN just now/)).toBeInTheDocument();
  expect(screen.getByText('1 of 3 games decided.', { exact: false })).toBeInTheDocument();
  expect(screen.queryByText(/unofficial/)).toBeNull();
});

describe('before the lock (D-139)', () => {
  beforeEach(() => {
    WEEK = OPEN;
  });

  it('shows a paid player who is in, the games without counts, and the boards, and reads no picks', async () => {
    standing = { entered: true, paid: true, muted: false };
    show();
    expect(screen.getByText('Picks are hidden')).toBeInTheDocument();
    const names = within(screen.getByRole('list', { name: "Who's in" })).getAllByRole('listitem');
    expect(names.map((li) => li.textContent)).toEqual(['Lou (you)', 'Pat']);
    expect(screen.getByRole('link', { name: 'See or edit your picks' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'By game' }));
    const games = screen.getByRole('list', { name: 'Games' });
    expect(within(games).getAllByRole('listitem')).toHaveLength(3);
    expect(games).toHaveTextContent('Monday night, the tiebreaker');
    expect(screen.queryByRole('button', { name: /Who picked what/ })).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /Board/ }));
    expect(screen.getByRole('region', { name: 'Board' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Earlier weeks' })).toBeInTheDocument();
    expect(entriesRead).not.toHaveBeenCalled();
  });

  it('tells an entrant who has not paid yet what they will see, and shows no board', () => {
    standing = { entered: true, paid: false, muted: false };
    show();
    expect(screen.getByText(/Once the pool confirms your payment/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: "Who's in" })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Board' })).toBeNull();
  });

  it('leaves someone who has not entered as before: the board says how to join', () => {
    standing = { entered: false, paid: false, muted: false };
    show();
    expect(screen.queryByText(/Once the pool confirms your payment/)).toBeNull();
    expect(screen.queryByRole('list', { name: "Who's in" })).toBeNull();
    expect(screen.getByRole('region', { name: 'Board' })).toBeInTheDocument();
  });

  it('gives the staff the full page without an entry', () => {
    staff = true;
    show();
    expect(screen.getByRole('list', { name: "Who's in" })).toBeInTheDocument();
    expect(entriesRead).not.toHaveBeenCalled();
  });
});
