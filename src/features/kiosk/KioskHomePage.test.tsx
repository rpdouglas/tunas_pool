import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { WeekView } from '../../lib/weekModel';
import type { KioskRosterPlayer } from '@shared/kiosk';
import { useCurrentWeek } from '../entry/entryData';
import {
  useKioskRoster,
  useSetKioskPin,
  useSubmitKioskEntry,
  useVerifyKioskPin,
} from './kioskData';
import KioskHomePage from './KioskHomePage';

vi.mock('../entry/entryData', () => ({ useCurrentWeek: vi.fn() }));
vi.mock('./kioskData', () => ({
  useKioskRoster: vi.fn(),
  useVerifyKioskPin: vi.fn(),
  useSetKioskPin: vi.fn(),
  useSubmitKioskEntry: vi.fn(),
  useRegisterKioskPlayer: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

const SAMPLE_ROSTER: KioskRosterPlayer[] = [
  { playerId: 'dale', displayName: 'Dale D.', hasPin: true },
  { playerId: 'rosalie', displayName: 'Rosalie M.', hasPin: false },
  { playerId: 'dwayne', displayName: 'Dwayne W.', hasPin: true },
];

function mockWeek(over: Partial<WeekView> = {}): WeekView {
  return {
    id: 'wk05',
    year: '2026',
    weekNumber: 5,
    status: 'open',
    lockAtMs: Date.now() + 3_600_000,
    revealed: false,
    games: [
      {
        id: 'g1',
        order: 1,
        home: 'BAL',
        away: 'PIT',
        slot: 'sunday',
        kickoffMs: Date.now() + 3_600_000,
      },
    ],
    mnfGameId: 'g1',
    entryFeeCents: 2000,
    entryCount: 0,
    paidCount: 0,
    results: {},
    mnfTotal: null,
    winner: null,
    payoutSent: false,
    backfilled: false,
    correctedAtMs: null,
    ...over,
  };
}

function renderKiosk() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <KioskHomePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('KioskHomePage searchable dropdown', () => {
  beforeEach(() => {
    vi.mocked(useCurrentWeek).mockReturnValue({
      data: mockWeek(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCurrentWeek>);

    vi.mocked(useKioskRoster).mockReturnValue({
      data: SAMPLE_ROSTER,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useKioskRoster>);

    vi.mocked(useVerifyKioskPin).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useVerifyKioskPin>);

    vi.mocked(useSetKioskPin).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useSetKioskPin>);

    vi.mocked(useSubmitKioskEntry).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useSubmitKioskEntry>);
  });

  it('keeps player roster hidden when search is empty (privacy by default)', () => {
    renderKiosk();

    // Roster names should not be displayed on the idle screen
    expect(screen.queryByText('Dale D.')).not.toBeInTheDocument();
    expect(screen.queryByText('Rosalie M.')).not.toBeInTheDocument();

    // Instructions and registration buttons are visible
    expect(screen.getByText("Ready to make this week's picks?")).toBeInTheDocument();
    expect(screen.getByText("I'm New to the Pool")).toBeInTheDocument();
  });

  it('shows dropdown matches when user types in search', async () => {
    const user = userEvent.setup();
    renderKiosk();

    const searchInput = screen.getByRole('combobox');
    await user.type(searchInput, 'dale');

    // Matches dropdown shows Dale
    expect(screen.getByText('Dale D.')).toBeInTheDocument();
    expect(screen.queryByText('Rosalie M.')).not.toBeInTheDocument();
  });

  it('shows "First visit · Set PIN" for players who have not set a PIN', async () => {
    const user = userEvent.setup();
    renderKiosk();

    const searchInput = screen.getByRole('combobox');
    await user.type(searchInput, 'rosalie');

    expect(screen.getByText('Rosalie M.')).toBeInTheDocument();
    expect(screen.getByText('First visit · Set PIN')).toBeInTheDocument();
  });

  it('shows offer to register with pre-filled name when player is not found', async () => {
    const user = userEvent.setup();
    renderKiosk();

    const searchInput = screen.getByRole('combobox');
    await user.type(searchInput, 'Arthur Dent');

    // Not found message
    expect(
      screen.getByText('No player found matching "Arthur Dent"')
    ).toBeInTheDocument();

    // Register button offering Arthur Dent
    const registerBtn = screen.getByRole('button', {
      name: /Register "Arthur Dent" as a New Player/i,
    });
    expect(registerBtn).toBeInTheDocument();

    // Clicking it opens the registration modal with name pre-filled
    await user.click(registerBtn);

    expect(screen.getByText('New Player Registration')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    const nameInput = within(dialog).getByDisplayValue('Arthur Dent');
    expect(nameInput).toBeInTheDocument();
  });

  it('clears search when clear button is clicked', async () => {
    const user = userEvent.setup();
    renderKiosk();

    const searchInput = screen.getByRole('combobox');
    await user.type(searchInput, 'dale');
    expect(screen.getByText('Dale D.')).toBeInTheDocument();

    const clearBtn = screen.getByRole('button', { name: 'Clear search' });
    await user.click(clearBtn);

    expect(searchInput).toHaveValue('');
    expect(screen.queryByText('Dale D.')).not.toBeInTheDocument();
  });

  it('transitions to PIN entry when a matching player is selected', async () => {
    const user = userEvent.setup();
    renderKiosk();

    const searchInput = screen.getByRole('combobox');
    await user.type(searchInput, 'dale');

    const selectBtn = screen.getByText('Dale D.');
    await user.click(selectBtn);

    // Moves to PIN verification stage
    expect(screen.getByText('Welcome back, Dale D.')).toBeInTheDocument();
  });
});
