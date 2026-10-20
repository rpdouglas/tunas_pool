import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { WeekView } from '../../lib/weekModel';
import { BoardSection } from './BoardSection';
import * as data from './boardData';

let viewer = { uid: 'alice', anonymous: false, isAdmin: false, isCounter: false };
let standing = { entered: true, paid: true, muted: false };
let playerId: string | null = 'p1';
let aliceAt = Date.now() - 60_000;

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { uid: viewer.uid, isAnonymous: viewer.anonymous },
    isAdmin: viewer.isAdmin,
    isCounter: viewer.isCounter,
  }),
}));
vi.mock('../entry/entryData', () => ({
  useMyProfile: () => ({
    data: playerId ? { id: playerId, data: { displayName: 'Alice A.' } } : null,
  }),
}));
vi.mock('./boardData', () => ({
  useBoardJoin: () => ({ isSuccess: true, isError: false, data: playerId }),
  useBoardStanding: () => ({ isSuccess: true, isError: false, data: standing }),
  useBoardMessages: () => ({
    loading: false,
    failed: false,
    messages: [
      {
        id: 'm1',
        playerId: 'p2',
        displayName: 'Dale D.',
        text: 'Jags by 20',
        createdAtMs: 0,
        edited: false,
        hidden: false,
      },
      {
        id: 'm2',
        playerId: 'p1',
        displayName: 'Alice A.',
        text: 'Dream on',
        createdAtMs: aliceAt,
        edited: false,
        hidden: false,
      },
      {
        id: 'm3',
        playerId: 'p3',
        displayName: 'Hank O.',
        text: '',
        createdAtMs: 0,
        edited: false,
        hidden: true,
      },
    ],
  }),
  useBoardReports: () => ({ m1: 2 }),
  useBoardMutes: () => [{ playerId: 'p3', displayName: 'Hank O.', reason: 'Brought up a mom' }],
  postMessage: vi.fn().mockResolvedValue(undefined),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  reportMessage: vi.fn().mockResolvedValue(undefined),
  hideMessage: vi.fn().mockResolvedValue(undefined),
  setMute: vi.fn(),
}));

const WEEK = {
  id: 'wk06',
  year: '2026',
  status: 'locked',
  lockAtMs: 0,
  winner: null,
} as unknown as WeekView;

function show(week: WeekView = WEEK) {
  render(
    <MemoryRouter>
      <BoardSection year="2026" week={week} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  viewer = { uid: 'alice', anonymous: false, isAdmin: false, isCounter: false };
  standing = { entered: true, paid: true, muted: false };
  playerId = 'p1';
  aliceAt = Date.now() - 60_000;
  vi.clearAllMocks();
});

it('a paid player posts under their own name, newest first, and can change only their own post', async () => {
  show();
  expect(screen.getByText(/no threats of violence/)).toBeInTheDocument();
  const posts = within(screen.getByRole('list', { name: 'Posts, newest first' })).getAllByRole(
    'listitem',
  );
  expect(posts[0]).toHaveTextContent('Hidden by the pool.');
  expect(posts[1]).toHaveTextContent('Dream on');
  expect(within(posts[1]).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  expect(within(posts[2]).queryByRole('button', { name: 'Edit' })).toBeNull();

  await userEvent.type(screen.getByLabelText('Your message'), '  Lions in 3  ');
  await userEvent.click(screen.getByRole('button', { name: 'Post' }));
  expect(data.postMessage).toHaveBeenCalledWith(
    '2026',
    'wk06',
    { playerId: 'p1', displayName: 'Alice A.' },
    'Lions in 3',
  );

  await userEvent.click(within(posts[2]).getByRole('button', { name: 'Report' }));
  expect(data.reportMessage).toHaveBeenCalledWith('2026', 'wk06', 'm1', 'p1');
  expect(within(posts[2]).getByRole('button', { name: 'Reported' })).toBeDisabled();
});

it('asks for a moment between posts instead of sending one the rules would refuse (D-109)', async () => {
  aliceAt = Date.now() - 5_000;
  show();
  await userEvent.type(screen.getByLabelText('Your message'), 'And another thing');
  await userEvent.click(screen.getByRole('button', { name: 'Post' }));
  expect(data.postMessage).not.toHaveBeenCalled();
  expect(screen.getByText(/more seconds before your next post/)).toBeInTheDocument();
});

it('a guest or an unpaid entry reads along and is told why they cannot post', () => {
  viewer.anonymous = true;
  show();
  expect(screen.getByText(/Save your account with Google or email to post/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Save your account' })).toHaveAttribute(
    'href',
    '/account',
  );
  expect(screen.queryByLabelText('Your message')).toBeNull();
  expect(screen.getByText('Jags by 20')).toBeInTheDocument();
});

it('someone who did not enter sees no posts', () => {
  standing = { entered: false, paid: false, muted: false };
  show();
  expect(screen.getByText(/The board is for this week's players/)).toBeInTheDocument();
  expect(screen.queryByText('Jags by 20')).toBeNull();
});

it('the counter sees reports and hides a post with a reason', async () => {
  viewer = { uid: 'devon', anonymous: false, isAdmin: false, isCounter: true };
  playerId = null;
  show();
  const dale = screen.getByText('Jags by 20').closest('li')!;
  expect(within(dale).getByText(/Reported 2 times/)).toBeInTheDocument();
  await userEvent.click(within(dale).getByRole('button', { name: 'Hide' }));
  await userEvent.click(within(dale).getByRole('button', { name: 'Hide post' }));
  expect(within(dale).getByRole('alert')).toHaveTextContent('Type a short reason first.');
  await userEvent.type(within(dale).getByLabelText('Why hide it?'), 'Threats, house rules');
  await userEvent.click(within(dale).getByRole('button', { name: 'Hide post' }));
  expect(data.hideMessage).toHaveBeenCalledWith('2026', 'wk06', 'm1', 'Threats, house rules');
});

it('the staff see who is muted this week and lift a mute with a reason (D-109)', async () => {
  viewer = { uid: 'devon', anonymous: false, isAdmin: false, isCounter: true };
  playerId = null;
  show();
  const muted = screen.getByRole('region', { name: 'Muted this week' });
  expect(muted).toHaveTextContent('Hank O.');
  expect(muted).toHaveTextContent('Muted: Brought up a mom');
  await userEvent.click(within(muted).getByRole('button', { name: 'Lift mute' }));
  await userEvent.click(within(muted).getByRole('button', { name: 'Lift mute' }));
  expect(within(muted).getByRole('alert')).toHaveTextContent('Type a short reason first.');
  await userEvent.type(within(muted).getByLabelText(/Why lift/), 'Apologized at the counter');
  await userEvent.click(within(muted).getByRole('button', { name: 'Lift mute' }));
  expect(data.setMute).toHaveBeenCalledWith(
    '2026',
    'wk06',
    'p3',
    false,
    'Apologized at the counter',
  );
});

it('players never see the muted list', () => {
  show();
  expect(screen.queryByRole('region', { name: 'Muted this week' })).toBeNull();
});
