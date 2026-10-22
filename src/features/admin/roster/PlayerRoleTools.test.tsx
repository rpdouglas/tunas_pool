import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RoleChoice } from '@shared/roles';
import { adminApi } from '../../../lib/adminApi';
import { PlayerRoleTools } from './PlayerRoleTools';
import type { RosterPlayer } from './roster';

vi.mock('../../../lib/adminApi', () => ({
  adminApi: { setStaffRole: vi.fn() },
}));

const devon: RosterPlayer = {
  playerId: 'devon',
  displayName: 'Devon',
  phone: null,
  usualPayment: null,
  notes: null,
  active: true,
  origin: 'self',
  claimed: true,
};

function show(role: RoleChoice | undefined | null, player = devon) {
  const onDone = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PlayerRoleTools player={player} role={role} onDone={onDone} />
    </QueryClientProvider>,
  );
  return onDone;
}

const select = () => screen.getByLabelText('Staff role');

describe('PlayerRoleTools (D-140)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers no switch to a player with no login, and says why', () => {
    show('none', { ...devon, claimed: false });
    expect(screen.queryByLabelText('Staff role')).toBeNull();
    expect(screen.getByText(/A staff role needs a login/)).toBeInTheDocument();
  });

  it('waits for the role before it can be changed', () => {
    show(undefined);
    expect(select()).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Checking their role');
  });

  it("says so when the role couldn't be checked", () => {
    show(null);
    expect(select()).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't check their role");
  });

  it('says what admin allows and saves only after the second tap', async () => {
    vi.mocked(adminApi.setStaffRole).mockResolvedValue({ role: 'admin', changed: true });
    const onDone = show('counter');
    expect(select()).toHaveValue('counter');

    await userEvent.selectOptions(select(), 'admin');
    expect(screen.getByText(/everything you can/)).toBeInTheDocument();
    expect(adminApi.setStaffRole).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Make them an admin' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(vi.mocked(adminApi.setStaffRole).mock.calls[0][0]).toEqual({
      playerId: 'devon',
      role: 'admin',
    });
    expect(onDone.mock.calls[0][0]).toMatch(/^Devon is now an admin\. .*Check again/);
  });

  it('can be backed out of, and shows what the server refused', async () => {
    vi.mocked(adminApi.setStaffRole).mockRejectedValue(
      new Error("You can't change your own role."),
    );
    show('none');
    await userEvent.selectOptions(select(), 'counter');
    await userEvent.click(screen.getByRole('button', { name: 'Leave as Player' }));
    expect(screen.queryByText(/mark cash received/)).toBeNull();

    await userEvent.selectOptions(select(), 'counter');
    await userEvent.click(screen.getByRole('button', { name: 'Make them a counter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/own role/);
  });
});
