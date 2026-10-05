import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PlayerDeleteCheck } from '@shared/adminTypes';
import { adminApi } from '../../../lib/adminApi';
import { PlayerDeleteTools } from './PlayerDeleteTools';
import type { RosterPlayer } from './roster';

vi.mock('../../../lib/adminApi', () => ({
  adminApi: { checkPlayerDelete: vi.fn(), deletePlayer: vi.fn() },
}));

const player: RosterPlayer = {
  playerId: 'rosalie',
  displayName: 'Rosalie M.',
  phone: null,
  usualPayment: null,
  notes: null,
  active: true,
  origin: 'admin',
  claimed: false,
};

function show(check: PlayerDeleteCheck) {
  vi.mocked(adminApi.checkPlayerDelete).mockResolvedValue(check);
  const onDone = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PlayerDeleteTools player={player} onDone={onDone} />
    </QueryClientProvider>,
  );
  return onDone;
}

const open = () => userEvent.click(screen.getByText('Added by mistake? Delete this player'));

describe('PlayerDeleteTools', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks the server nothing until the section is opened', () => {
    show({ ok: true });
    expect(adminApi.checkPlayerDelete).not.toHaveBeenCalled();
  });

  it('explains why not, with no delete button, for someone who has played', async () => {
    show({
      ok: false,
      code: 'played',
      message: 'Rosalie M. has played one week (week 3 of 2026). Make them Inactive.',
    });
    await open();
    expect(await screen.findByText(/has played one week/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete Rosalie/ })).toBeNull();
    expect(adminApi.checkPlayerDelete).toHaveBeenCalledWith({
      playerId: 'rosalie',
      dryRun: true,
    });
  });

  it('asks for a reason first, then deletes and says so', async () => {
    const onDone = show({ ok: true });
    vi.mocked(adminApi.deletePlayer).mockResolvedValue({ deleted: true });
    await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Rosalie M.…' }));
    expect(screen.getByText(/This can't be undone/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete Rosalie M.' }));
    expect(await screen.findByText(/short reason/)).toBeInTheDocument();
    expect(adminApi.deletePlayer).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Why are you deleting them?'), 'Added by mistake');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Rosalie M.' }));
    await waitFor(() => expect(adminApi.deletePlayer).toHaveBeenCalledOnce());
    // The query library passes extra arguments after the request, so look at the request itself.
    expect(vi.mocked(adminApi.deletePlayer).mock.calls[0][0]).toEqual({
      playerId: 'rosalie',
      reason: 'Added by mistake',
    });
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Rosalie M. deleted'));
  });

  it('can be backed out of, and shows the server refusing if things changed meanwhile', async () => {
    show({ ok: true });
    vi.mocked(adminApi.deletePlayer).mockRejectedValue(
      new Error('Rosalie M. has played one week.'),
    );
    await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Rosalie M.…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep them' }));
    expect(screen.getByRole('button', { name: 'Delete Rosalie M.…' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete Rosalie M.…' }));
    await userEvent.type(screen.getByLabelText('Why are you deleting them?'), 'Added by mistake');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Rosalie M.' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('has played one week');
  });
});
