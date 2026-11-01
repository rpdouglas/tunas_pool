import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { httpsCallable } from 'firebase/functions';
import { ReopenPicks } from './ReopenPicks';
import type { WeekView } from './weekData';

vi.mock('../../../lib/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

const HOUR = 60 * 60_000;
const now = Date.now();
const week: WeekView = {
  id: 'wk08',
  year: '2026',
  weekNumber: 8,
  status: 'locked',
  lockAtMs: now - HOUR,
  revealed: true,
  games: [
    {
      id: 'g01',
      order: 1,
      away: 'Bills',
      home: 'Dolphins',
      slot: 'sunday',
      kickoffMs: now + 6 * HOUR,
    },
    {
      id: 'mnf',
      order: 2,
      away: 'Ravens',
      home: 'Steelers',
      slot: 'mnf',
      kickoffMs: now + 30 * HOUR,
    },
  ],
  mnfGameId: 'mnf',
  entryFeeCents: 2000,
  entryCount: 3,
  paidCount: 3,
  results: {},
  mnfTotal: null,
  winner: null,
  payoutSent: false,
  backfilled: false,
  correctedAtMs: null,
};

function show() {
  const onDone = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReopenPicks week={week} onDone={onDone} />
    </QueryClientProvider>,
  );
  return onDone;
}

describe('ReopenPicks (D-145)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('needs a reason, then a second tap, before it calls the server', async () => {
    const call = vi.fn().mockResolvedValue({ data: { status: 'open' } });
    vi.mocked(httpsCallable).mockReturnValue(call as never);
    const onDone = show();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Reopen picks' }));
    const reopen = screen.getByRole('button', { name: 'Reopen picks' });
    expect(reopen).toBeDisabled(); // no reason yet
    await user.type(screen.getByLabelText(/Reason/), 'Locked too early');
    expect(reopen).toBeEnabled();
    await user.click(reopen);
    expect(call).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Yes, reopen picks' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(httpsCallable).toHaveBeenCalledWith({}, 'adminReopenWeek');
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ year: '2026', weekId: 'wk08', reason: 'Locked too early' }),
    );
    expect(onDone.mock.calls[0][0]).toMatchObject({ tone: 'ok' });
    expect(onDone.mock.calls[0][0].text).toMatch(/Picks are open again until/);
  });

  it('says why a lock time after the first kickoff will not work', async () => {
    show();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reopen picks' }));
    const time = screen.getByLabelText('Lock time');
    await user.clear(time);
    // The first game is six hours away; a lock tomorrow is after it.
    const date = screen.getByLabelText('Lock date');
    await user.clear(date);
    await user.type(date, new Date(now + 48 * HOUR).toISOString().slice(0, 10));
    await user.type(time, '12:00');
    expect(screen.getByText(/Picks must lock before the first game kicks off/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Reason/), 'Locked too early');
    expect(screen.getByRole('button', { name: 'Reopen picks' })).toBeDisabled();
  });
});
