import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { tiebreakSummary } from '@shared/tiebreak';
import { TiebreakerPanel } from './TiebreakerPanel';

const entries = [
  { playerId: 'dale', displayName: 'Dale D.', tiebreakerTotal: 44 },
  { playerId: 'jen', displayName: 'Jen K.', tiebreakerTotal: 50 },
  { playerId: 'pat', displayName: 'Pat', tiebreakerTotal: 38 },
];

it('shows the total so far, your guess, the spread, and the tied leaders in tiebreak order', async () => {
  render(
    <TiebreakerPanel
      total={47}
      totalNote="so far · Q4 · 2:10"
      summary={tiebreakSummary(entries, 47, 'dale', ['dale', 'jen'])}
    />,
  );
  expect(screen.getByText(/Monday night total/)).toHaveTextContent(
    'Monday night total: 47 so far · Q4 · 2:10',
  );
  expect(screen.getByText(/Your guess/)).toHaveTextContent('Your guess: 44 (under)');
  expect(
    screen.getByText('Guesses run from 38 to 50. The middle guess is 44.'),
  ).toBeInTheDocument();
  const leaders = within(
    screen.getByText('Tied for the lead right now:').parentElement!,
  ).getAllByRole('listitem');
  expect(leaders.map((li) => li.textContent)).toEqual(['Jen K.50 at or over', 'Dale D.44 under']);

  await userEvent.click(screen.getByText("Everyone's guesses (3)"));
  // The total sits where it falls among the guesses: after 38 and 44, before 50.
  const all = screen.getByText("Everyone's guesses (3)").closest('details')!;
  expect(
    within(all)
      .getAllByRole('listitem')
      .map((li) => li.textContent),
  ).toEqual(['Pat38', 'Dale D.44', 'Total 47 so far · Q4 · 2:10Jen K.50']);
});

it('before kickoff: no total, no at-or-over, and no leaders section when one player leads', () => {
  render(
    <TiebreakerPanel
      total={null}
      totalNote="not started. Kickoff Mon 8:15 PM"
      summary={tiebreakSummary(entries, null, null, ['jen'])}
    />,
  );
  expect(screen.getByText(/Monday night total/)).toHaveTextContent(
    'Monday night total: not started. Kickoff Mon 8:15 PM',
  );
  expect(screen.queryByText(/Your guess/)).toBeNull();
  expect(screen.queryByText('Tied for the lead right now:')).toBeNull();
});
