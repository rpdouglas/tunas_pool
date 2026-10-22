import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KioskReceiptModal, type KioskReceiptGame } from './KioskReceiptModal';

const games: KioskReceiptGame[] = [
  {
    id: 'g01',
    away: 'Ravens',
    home: 'Steelers',
    slot: 'sunday',
  },
  {
    id: 'mnf',
    away: 'Cowboys',
    home: 'Giants',
    slot: 'mnf',
  },
];

describe('KioskReceiptModal', () => {
  it('displays player name, games picked, and cash instructions', () => {
    const onDone = vi.fn();
    render(
      <KioskReceiptModal
        playerName="Dale D."
        playerId="dale-p1"
        picks={{ g01: 'away', mnf: 'home' }}
        games={games}
        tiebreakerTotal={45}
        paymentMethod="cash"
        onDone={onDone}
      />,
    );

    expect(screen.getByText(/Picks In! Good Luck, Dale D.!/)).toBeInTheDocument();
    expect(screen.getByText(/2 games picked · MNF tiebreaker: 45 pts/)).toBeInTheDocument();
    expect(screen.getByText(/Please hand your \$20 cash to Devon or Ryan at the counter/)).toBeInTheDocument();

    const finishBtn = screen.getByText('Finish / Next Player');
    fireEvent.click(finishBtn);
    expect(onDone).toHaveBeenCalled();
  });

  it('displays e-transfer instructions when paymentMethod is etransfer', () => {
    render(
      <KioskReceiptModal
        playerName="Dale D."
        playerId="dale-p1"
        picks={{ g01: 'away', mnf: 'home' }}
        games={games}
        tiebreakerTotal={45}
        paymentMethod="etransfer"
        onDone={() => {}}
      />,
    );

    expect(screen.getByText(/payments@tunaspool.ca/)).toBeInTheDocument();
  });
});
