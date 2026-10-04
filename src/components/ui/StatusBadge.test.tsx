import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('always shows a word, never color alone', () => {
    render(<StatusBadge status="paid" />);
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });

  it('uses the locked style for locked weeks', () => {
    render(<StatusBadge status="locked" />);
    expect(screen.getByText('Locked').closest('span')).toHaveClass('badge-locked');
  });
});
