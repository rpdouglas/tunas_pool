import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import WeekPage from './WeekPage';

const refetchScores = vi.fn();
const refetchWeek = vi.fn();
let feedFailed = false;

const WEEK = {
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

vi.mock('../auth/useAuth', () => ({
  useGuestSession: () => ({ user: { uid: 'u1' }, failed: false }),
}));
vi.mock('../claims/claimsData', () => ({ useMyProfile: () => ({ data: null }) }));
vi.mock('./standingsData', () => ({ useSeasonWeekList: () => ({ data: [] }) }));
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
  useRevealEntries: () => ({
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
  }),
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
});

it('falls back to the saved results when ESPN cannot be reached', () => {
  feedFailed = true;
  show();
  expect(screen.getByText(/Couldn't get scores from ESPN just now/)).toBeInTheDocument();
  expect(screen.getByText('1 of 3 games decided.', { exact: false })).toBeInTheDocument();
  expect(screen.queryByText(/unofficial/)).toBeNull();
});
