import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { RosterPlayer } from '../roster/roster';
import type { ExistingEntry } from './importPlan';
import ImportPicksPage from './ImportPicksPage';

const runImport = vi.fn();
const showToast = vi.fn();

const WEEK = {
  id: 'wk06',
  year: '2026',
  weekNumber: 6,
  status: 'open',
  lockAtMs: Date.now() + 86_400_000,
  revealed: false,
  games: [
    { id: 'g01', order: 1, away: 'Texans', home: 'Jaguars', kickoffMs: 0, slot: 'sunday' },
    { id: 'mnf', order: 15, away: 'Commanders', home: '49ers', kickoffMs: 0, slot: 'mnf' },
  ],
  mnfGameId: 'mnf',
  entryFeeCents: 2000,
  backfilled: false,
};

const player = (playerId: string, displayName: string): RosterPlayer => ({
  playerId,
  displayName,
  phone: null,
  usualPayment: null,
  notes: null,
  active: true,
  origin: 'admin',
  claimed: false,
});

vi.mock('../useAdminWeek', () => ({
  useAdminWeek: () => ({
    year: '2026',
    week: WEEK,
    weeks: [WEEK],
    isPending: false,
    isError: false,
    search: (id: string) => `?week=${id}`,
    select: () => undefined,
  }),
}));
vi.mock('../roster/rosterData', () => ({
  useRoster: () => ({
    isPending: false,
    isError: false,
    data: [player('jen', 'Jen K.'), player('nancy', 'Nancy'), player('barry', 'Barry Thompson')],
  }),
}));
vi.mock('../payments/paymentsData', () => ({
  useEntriesList: () => ({ isPending: false, isError: false, data: { rows: [] } }),
}));
vi.mock('./importData', () => ({
  useExistingEntries: () => ({
    isSuccess: true,
    data: new Map<string, ExistingEntry>([
      // Jen entered on the website with different picks: kept unless Replace is ticked.
      ['jen', { source: 'web', picks: { g01: 'away', mnf: 'away' }, tiebreakerTotal: 30 }],
    ]),
  }),
  useRunImport: () => runImport,
}));
vi.mock('../../../components/ui/toastContext', () => ({ useToast: () => ({ showToast }) }));

const CSV = [
  'Participant,G1,MNF,TB Pts,Record,Paid?',
  'Matchup,Texans at Jaguars (London),Commanders at 49ers,Total,W-L,Paid / Down',
  'Jen K.,Jaguars,49ers,41,0-0,',
  'Nancy,Texans,49ers,52,0-0,',
  'Barry T,Jags,Commanders,48,0-0,',
  'Darkness,Jaguars,49ers,53,0-0,',
  ',,,,,',
  'Entry Fee,$20,,,,',
].join('\n');

it('previews the sheet, keeps picks already in, and imports what is ready', async () => {
  const user = userEvent.setup();
  runImport.mockResolvedValue([]);
  render(
    <MemoryRouter>
      <ImportPicksPage />
    </MemoryRouter>,
  );
  await user.upload(
    screen.getByLabelText('Spreadsheet (CSV file)'),
    new File([CSV], 'week6.csv', { type: 'text/csv' }),
  );

  expect(await screen.findByText(/4 lines:/)).toHaveTextContent(
    '4 lines: 2 to import (1 new to the roster), 1 already in and kept, 1 need you to say who they are.',
  );
  expect(screen.getByText('Already in from the website, 3 different')).toBeInTheDocument();

  // Barry T is close to Barry Thompson, so the screen asks rather than guesses.
  const lines = screen.getAllByLabelText('Who is this?');
  await user.selectOptions(lines[2], 'p:barry');
  await user.click(screen.getByRole('button', { name: 'Import 3 entries' }));

  await waitFor(() => expect(runImport).toHaveBeenCalled());
  const [jobs, reason] = runImport.mock.calls[0];
  expect(reason).toBeNull();
  expect(
    jobs.map((j: { row: { name: string }; playerId: string | null }) => [j.row.name, j.playerId]),
  ).toEqual([
    ['Nancy', 'nancy'],
    ['Barry T', 'barry'],
    ['Darkness', null],
  ]);
});
