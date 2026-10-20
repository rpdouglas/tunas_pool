import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import type { HallList } from '@shared/hallOfFame';
import { HallOfFameList } from './HallOfFameList';

const LIST: HallList = {
  key: 'titles',
  title: 'Most weekly wins',
  about: 'Weeks won. A split pot counts for each winner.',
  entries: [
    {
      playerId: 'dale',
      displayName: 'Dale D.',
      place: 1,
      tied: false,
      value: '3 weeks won',
      detail: null,
    },
    {
      playerId: 'jen',
      displayName: 'Jen K.',
      place: 2,
      tied: true,
      value: '1 week won',
      detail: null,
    },
    {
      playerId: 'pat',
      displayName: 'Pat',
      place: 2,
      tied: true,
      value: '1 week won',
      detail: null,
    },
  ],
  more: 'And 6 others with 1 win.',
  empty: 'No winners yet.',
};

const show = (list: HallList, me?: string) =>
  render(
    <MemoryRouter>
      <HallOfFameList list={list} myPlayerId={me} />
    </MemoryRouter>,
  );

it('lists places in words, links each player, and marks you', () => {
  show(LIST, 'jen');
  const rows = within(screen.getByRole('list', { name: 'Most weekly wins' })).getAllByRole('link');
  expect(rows.map((r) => r.textContent)).toEqual([
    '1Dale D.3 weeks won',
    'Tied 2Jen K.You1 week won',
    'Tied 2Pat1 week won',
  ]);
  expect(rows[0]).toHaveAttribute('href', '/player/dale');
  expect(screen.getByText('And 6 others with 1 win.')).toBeInTheDocument();
});

it('says so when nobody is on the list yet', () => {
  show({ ...LIST, entries: [], more: null });
  expect(screen.getByText('No winners yet.')).toBeInTheDocument();
  expect(screen.queryByRole('list')).toBeNull();
});
