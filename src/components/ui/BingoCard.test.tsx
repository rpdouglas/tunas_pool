import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BingoBalls, BingoCardPanel } from './BingoCard';
import { BingoNumberPicker } from './BingoNumberPicker';

const props = {
  title: 'Card 1',
  numbers: [3, 11, 19, 27, 35, 43],
  hits: [11, 27],
  paidDraws: 1,
  drawsSoFar: 2,
  dueDraw: '2026-11-18',
  payment: null,
};

describe('BingoBalls', () => {
  it('says which numbers are crossed off in words, not colour alone', () => {
    render(<BingoBalls numbers={props.numbers} hits={props.hits} />);
    const balls = screen.getAllByRole('listitem');
    expect(balls).toHaveLength(6);
    expect(balls[1]).toHaveTextContent('11, crossed off');
    expect(balls[0]).toHaveTextContent('3, not yet');
    expect(balls[1]).toHaveAttribute('data-hit', 'true');
  });
});

describe('BingoCardPanel', () => {
  it('shows the hits, the paid weeks, and this week in words', () => {
    render(<BingoCardPanel {...props} />);
    expect(screen.getByText('2 of 6 crossed off: 11 and 27.')).toBeInTheDocument();
    expect(screen.getByText('Paid for 1 of 2 draws so far.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Not paid yet for Wed, Nov 18.');
  });

  it('lets the owner say how they will pay, and hides that once paid', async () => {
    const onIntent = vi.fn();
    const { rerender } = render(<BingoCardPanel {...props} onIntent={onIntent} />);
    await userEvent.click(screen.getByLabelText('Cash at the shop'));
    expect(onIntent).toHaveBeenCalledWith('cash');
    rerender(
      <BingoCardPanel
        {...props}
        onIntent={onIntent}
        payment={{ paid: true, late: false, intent: 'cash' }}
      />,
    );
    expect(screen.queryByLabelText('Cash at the shop')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('✓ Paid for Wed, Nov 18.');
  });

  it('asks once before stopping a card', async () => {
    const onRetire = vi.fn();
    render(<BingoCardPanel {...props} onRetire={onRetire} />);
    await userEvent.click(screen.getByRole('button', { name: 'Stop this card' }));
    expect(screen.getByText(/can't be paid for again/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(onRetire).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Stop this card' }));
    await userEvent.click(screen.getByRole('button', { name: 'Stop the card' }));
    expect(onRetire).toHaveBeenCalledOnce();
  });
});

describe('BingoNumberPicker', () => {
  it('picks exactly six, then adds the card; quick pick sends null', async () => {
    const onSubmit = vi.fn();
    render(<BingoNumberPicker onSubmit={onSubmit} />);
    const add = screen.getByRole('button', { name: 'Add this card' });
    expect(add).toBeDisabled();
    for (const n of ['43', '3', '27', '11', '35', '19']) {
      await userEvent.click(screen.getByRole('button', { name: n }));
    }
    expect(screen.getByRole('status')).toHaveTextContent('6 of 6 picked: 3, 11, 19, 27, 35, 43');
    expect(screen.getByRole('button', { name: '1' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '43' }));
    expect(screen.getByRole('status')).toHaveTextContent('5 of 6 picked');
    await userEvent.click(screen.getByRole('button', { name: '49' }));
    await userEvent.click(add);
    expect(onSubmit).toHaveBeenCalledWith([3, 11, 19, 27, 35, 49]);
    await userEvent.click(screen.getByRole('button', { name: 'Quick pick' }));
    expect(onSubmit).toHaveBeenLastCalledWith(null);
  });
});
