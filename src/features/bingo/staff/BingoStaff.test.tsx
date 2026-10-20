import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PaymentRowData } from '@shared/bingoStaffView';
import { ApprovedDrawRow, BingoDrawPanel } from './BingoDrawPanel';
import { BingoPaymentRow } from './BingoPaymentRow';

const row: PaymentRowData = {
  cardId: 'c1',
  playerId: 'p1',
  displayName: 'Rosalie M.',
  label: 'Card',
  numbers: [1, 2, 3, 4, 40, 41],
  due: null,
  paidNext: false,
  nextMethod: null,
  paper: true,
};

describe('BingoPaymentRow (D-114, D-119)', () => {
  it('the counter gets one big cash button, and no e-Transfer', async () => {
    const onPay = vi.fn();
    render(
      <BingoPaymentRow row={row} isAdmin={false} busy={false} onPay={onPay} onUndo={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /e-Transfer/ })).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Mark Rosalie M., Card, paid in cash' }),
    );
    expect(onPay).toHaveBeenCalledWith('cash', undefined);
    expect(screen.getByText('Paper')).toBeInTheDocument();
  });

  it('can undo cash, but only the commissioner undoes an e-Transfer', () => {
    const etransfer = {
      ...row,
      due: { paid: true, method: 'etransfer' as const, late: false, intent: null },
    };
    const { rerender } = render(
      <BingoPaymentRow
        row={etransfer}
        isAdmin={false}
        busy={false}
        onPay={vi.fn()}
        onUndo={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Undo/ })).not.toBeInTheDocument();
    rerender(
      <BingoPaymentRow row={etransfer} isAdmin busy={false} onPay={vi.fn()} onUndo={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /Undo/ })).toBeInTheDocument();
    rerender(
      <BingoPaymentRow
        row={{ ...row, due: { paid: true, method: 'cash', late: false, intent: null } }}
        isAdmin={false}
        busy={false}
        onPay={vi.fn()}
        onUndo={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Undo/ })).toBeInTheDocument();
  });

  it('money received earlier needs the time and a reason before it can be saved', async () => {
    const onPay = vi.fn();
    render(<BingoPaymentRow row={row} isAdmin busy={false} onPay={onPay} onUndo={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Received earlier?' }));
    const cash = screen.getByRole('button', { name: /paid in cash/ });
    expect(cash).toBeDisabled();
    await userEvent.type(screen.getByLabelText('When the money came in'), '2026-11-18T17:50');
    await userEvent.type(screen.getByLabelText(/Reason/), 'Handed over before six');
    await userEvent.click(cash);
    expect(onPay).toHaveBeenCalledWith('cash', {
      receivedAtMs: new Date('2026-11-18T17:50').getTime(),
      reason: 'Handed over before six',
    });
  });
});

describe('BingoPaymentRow: late money', () => {
  it('a late payment can be taken back now; the counter only when it was cash', async () => {
    const onUndoNext = vi.fn();
    const late = { ...row, paidNext: true, nextMethod: 'cash' as const };
    const { rerender } = render(
      <BingoPaymentRow
        row={late}
        isAdmin={false}
        busy={false}
        onPay={vi.fn()}
        onUndo={vi.fn()}
        onUndoNext={onUndoNext}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Undo the late payment for Rosalie M./ }),
    );
    expect(onUndoNext).toHaveBeenCalledOnce();
    rerender(
      <BingoPaymentRow
        row={{ ...late, nextMethod: 'etransfer' }}
        isAdmin={false}
        busy={false}
        onPay={vi.fn()}
        onUndo={vi.fn()}
        onUndoNext={onUndoNext}
      />,
    );
    expect(screen.queryByRole('button', { name: /Undo the late payment/ })).not.toBeInTheDocument();
  });
});

describe('BingoDrawPanel (D-126, D-129)', () => {
  const props = {
    drawDate: '2026-11-18',
    numbers: null,
    busy: false,
    error: null,
    onEnter: vi.fn(),
    onApprove: vi.fn(),
    onSkip: vi.fn(),
  };

  it('before the cutoff: nothing to type yet', () => {
    render(<BingoDrawPanel {...props} step="before-cutoff" isAdmin={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('numbers go in after the 6 PM cutoff');
    expect(screen.queryByLabelText('The six numbers')).not.toBeInTheDocument();
  });

  it('types six numbers, refusing a bad line in plain words', async () => {
    const onEnter = vi.fn();
    render(<BingoDrawPanel {...props} onEnter={onEnter} step="needs-numbers" isAdmin={false} />);
    await userEvent.type(screen.getByLabelText('The six numbers'), '4 5 6 33 34');
    await userEvent.click(screen.getByRole('button', { name: 'Save the numbers' }));
    expect(screen.getByRole('alert')).toHaveTextContent("Type six numbers. That's 5.");
    await userEvent.type(screen.getByLabelText('The six numbers'), ' 35');
    await userEvent.click(screen.getByRole('button', { name: 'Save the numbers' }));
    expect(onEnter).toHaveBeenCalledWith([4, 5, 6, 33, 34, 35]);
  });

  it('a waiting draw is approved by a person; only the commissioner can skip', async () => {
    const onApprove = vi.fn();
    const onSkip = vi.fn();
    const { rerender } = render(
      <BingoDrawPanel
        {...props}
        numbers={[4, 5, 6, 33, 34, 35]}
        onApprove={onApprove}
        step="waiting-approval"
        isAdmin={false}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Approve these numbers' }));
    expect(onApprove).toHaveBeenCalledOnce();
    expect(screen.queryByText(/cancelled or postponed/)).not.toBeInTheDocument();
    rerender(<BingoDrawPanel {...props} onSkip={onSkip} step="needs-numbers" isAdmin />);
    await userEvent.click(screen.getByRole('button', { name: /cancelled or postponed/ }));
    await userEvent.type(
      screen.getByLabelText('Why is this draw skipped?'),
      'Postponed by the lottery',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Skip the draw' }));
    expect(onSkip).toHaveBeenCalledWith('Postponed by the lottery');
  });

  it('an approved draw can be corrected by the commissioner only', async () => {
    const onCorrect = vi.fn();
    const base = {
      drawDate: '2026-11-11',
      label: 'Wed, Nov 11',
      numbers: [4, 5, 7, 33, 34, 35],
      paidCards: 3,
      corrected: false,
      busy: false,
      onCorrect,
    };
    const { rerender } = render(<ApprovedDrawRow {...base} isAdmin={false} />);
    expect(screen.queryByRole('button', { name: 'Correct this draw' })).not.toBeInTheDocument();
    rerender(<ApprovedDrawRow {...base} isAdmin />);
    await userEvent.click(screen.getByRole('button', { name: 'Correct this draw' }));
    await userEvent.type(screen.getByLabelText('The right six numbers'), '4 5 6 33 34 35');
    await userEvent.type(screen.getByLabelText('Reason'), 'Ticket says 6');
    await userEvent.click(screen.getByRole('button', { name: 'Correct it' }));
    expect(onCorrect).toHaveBeenCalledWith([4, 5, 6, 33, 34, 35], 'Ticket says 6');
  });
});
