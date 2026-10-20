import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BingoRoutes from './BingoRoutes';
import { useBingoStatus, type BingoStatus } from './bingoData';

vi.mock('../auth/useAuth', () => ({
  useGuestSession: () => ({ user: { uid: 'u1', isAnonymous: false }, ready: true, failed: false }),
  useAuth: () => ({
    user: { uid: 'u1', isAnonymous: false },
    ready: true,
    isAdmin: false,
    isCounter: false,
  }),
}));
vi.mock('../entry/entryData', () => ({ useMyProfile: () => ({ data: null }) }));
vi.mock('../../components/layout/AppMenu', () => ({ AppBar: () => null }));
vi.mock('./bingoData', async (orig) => ({
  ...(await orig<typeof import('./bingoData')>()),
  useBingoStatus: vi.fn(),
}));

const status = (over: Partial<BingoStatus>): BingoStatus => ({
  visible: true,
  enabled: true,
  member: false,
  staff: false,
  playerId: 'p1',
  rules: { priceCents: 1000, operatorPct: 40, maxWeeks: 26 },
  ...over,
});

function at(path: string, s: BingoStatus) {
  vi.mocked(useBingoStatus).mockReturnValue({ data: s, isError: false } as never);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/b/*" element={<BingoRoutes />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BingoRoutes (D-128, D-132)', () => {
  it('is an ordinary "not found" to anyone who may not see it', () => {
    at('/b', status({ visible: false, enabled: false }));
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.queryByText(/Bingo/i)).not.toBeInTheDocument();
  });

  it('a newcomer gets the plain-words welcome and the code form, and can read the rules', () => {
    at('/b', status({}));
    expect(screen.getByRole('heading', { name: 'Tunas 649 Bingo' })).toBeInTheDocument();
    expect(screen.getByText(/Nothing is paid on this page/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Invite code/)).toBeInTheDocument();
    expect(screen.getByLabelText("I'm 18 or older")).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Bingo' })).not.toBeInTheDocument();
  });

  it('the rules say the odds from the game’s settings, and where to get help', () => {
    at('/b/rules', status({ rules: { priceCents: 2000, operatorPct: 30, maxWeeks: 26 } }));
    expect(screen.getByText('A card is $20 a draw.')).toBeInTheDocument();
    expect(screen.getByText(/about 70¢ of every dollar/)).toBeInTheDocument();
    expect(screen.getByText(/ConnexOntario/)).toBeInTheDocument();
  });

  it('a non-member is sent back from the members’ pages', () => {
    at('/b/cards', status({}));
    expect(screen.getByLabelText(/Invite code/)).toBeInTheDocument();
  });

  it('sets noindex while open', () => {
    at('/b/rules', status({}));
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow',
    );
  });
});
