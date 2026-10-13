import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { CounterRow } from '@shared/adminTypes';
import { adminApi } from '../../lib/adminApi';
import type { WeekView } from '../../lib/weekModel';
import { useCurrentWeek } from '../entry/entryData';
import CounterPage from './CounterPage';

vi.mock('../../lib/adminApi', () => ({
  adminApi: { counterOverview: vi.fn(), setPayment: vi.fn(), counterSavePlayer: vi.fn() },
}));
vi.mock('../entry/entryData', () => ({ useCurrentWeek: vi.fn() }));

const row = (id: string, name: string, over: Partial<CounterRow> = {}): CounterRow => ({
  playerId: id,
  displayName: name,
  active: true,
  origin: 'admin',
  entered: false,
  source: null,
  late: false,
  paymentStatus: null,
  paymentMethod: null,
  ...over,
});

const ROWS = [
  row('dale', 'Dale D.', {
    entered: true,
    source: 'paper',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
  }),
  row('jen', 'Jen K.', {
    entered: true,
    source: 'web',
    paymentStatus: 'unpaid',
    paymentMethod: 'etransfer',
  }),
  row('troy', 'Troy T.', { entered: true, paymentStatus: 'paid', paymentMethod: 'etransfer' }),
  row('rosalie', 'Rosalie M.'),
  row('old', 'Old Timer', { active: false }),
  row('kid', 'Dwayne W.', { origin: 'self' }),
];

function week(over: Partial<WeekView> = {}): WeekView {
  return {
    id: 'wk05',
    year: '2026',
    weekNumber: 5,
    status: 'open',
    lockAtMs: Date.now() + 3_600_000,
    revealed: false,
    games: [],
    mnfGameId: 'mnf',
    entryFeeCents: 2000,
    entryCount: 3,
    paidCount: 2,
    results: {},
    mnfTotal: null,
    winner: null,
    payoutSent: false,
    backfilled: false,
    correctedAtMs: null,
    ...over,
  };
}

function show(w: WeekView | null = week()) {
  vi.mocked(useCurrentWeek).mockReturnValue({
    isPending: false,
    isError: false,
    data: w,
  } as unknown as ReturnType<typeof useCurrentWeek>);
  vi.mocked(adminApi.counterOverview).mockResolvedValue({ rows: ROWS });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <CounterPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// The list item that holds a player's name.
const item = (name: string) => within(screen.getByText(name).closest('li')!);

describe('CounterPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the roster with who is in and how they paid, in words', async () => {
    show();
    expect(await screen.findByText('Dale D.')).toBeInTheDocument();
    expect(screen.getByText(/3 in, 2 not yet/)).toBeInTheDocument();
    expect(item('Dale D.').getByText('Paid cash')).toBeInTheDocument();
    expect(item('Jen K.').getByText('Unpaid (said e-Transfer)')).toBeInTheDocument();
    expect(item('Rosalie M.').getByText('Not yet')).toBeInTheDocument();
    // An inactive player who has not entered stays out of the way.
    expect(screen.queryByText('Old Timer')).toBeNull();
  });

  it('shows no phone, email, note, or picks anywhere', async () => {
    show();
    await screen.findByText('Dale D.');
    expect(document.body.textContent).not.toMatch(/\+1\d{10}|@|\d{3}-\d{3}-\d{4}/);
  });

  it('offers Enter picks for someone not in, Paid cash for someone unpaid, and Undo for cash', async () => {
    show();
    await screen.findByText('Dale D.');
    expect(
      item('Rosalie M.').getByRole('link', { name: 'Enter picks for Rosalie M.' }),
    ).toHaveAttribute('href', '/counter/enter/rosalie');
    expect(item('Jen K.').getByRole('button', { name: 'Paid cash: Jen K.' })).toBeInTheDocument();
    expect(item('Dale D.').getByRole('button', { name: 'Undo cash: Dale D.' })).toBeInTheDocument();
  });

  it('explains an e-Transfer instead of offering to undo it', async () => {
    show();
    await screen.findByText('Troy T.');
    expect(
      item('Troy T.').getByText(/Paid by e-Transfer. The commissioner confirms those./),
    ).toBeInTheDocument();
    expect(item('Troy T.').queryByRole('button', { name: /cash/i })).toBeNull();
  });

  it('marks cash received through the server, always as cash', async () => {
    show();
    vi.mocked(adminApi.setPayment).mockResolvedValue({ changed: true, status: 'paid' });
    await userEvent.click(await screen.findByRole('button', { name: 'Paid cash: Jen K.' }));
    await waitFor(() => expect(adminApi.setPayment).toHaveBeenCalledOnce());
    expect(vi.mocked(adminApi.setPayment).mock.calls[0][0]).toEqual({
      year: expect.any(String),
      weekId: 'wk05',
      playerId: 'jen',
      status: 'paid',
      method: 'cash',
    });
  });

  it('finds a player by part of a name', async () => {
    show();
    await userEvent.type(await screen.findByLabelText('Find a player'), 'ros');
    expect(screen.getByText('Rosalie M.')).toBeInTheDocument();
    expect(screen.queryByText('Dale D.')).toBeNull();
  });

  it('lets the counter fix a roster player, but not someone who signed up on the website', async () => {
    show();
    await screen.findByText('Dale D.');
    expect(screen.getByRole('button', { name: 'Fix details for Dale D.' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fix details for Dwayne W.' })).toBeNull();
  });

  it('after the lock, offers no new sheet and says to ask the commissioner', async () => {
    show(week({ status: 'locked', lockAtMs: Date.now() - 3_600_000 }));
    await screen.findByText('Dale D.');
    expect(screen.getByText('Picks are locked.', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Enter picks for/ })).toBeNull();
    expect(
      item('Rosalie M.').getByText('Picks are locked. Ask the commissioner.'),
    ).toBeInTheDocument();
    // Cash for a sheet that is already in still works.
    expect(item('Jen K.').getByRole('button', { name: 'Paid cash: Jen K.' })).toBeInTheDocument();
  });

  it('says so when no week is open', () => {
    show(null);
    expect(screen.getByText('No week is open yet. Ask the commissioner.')).toBeInTheDocument();
  });
});
