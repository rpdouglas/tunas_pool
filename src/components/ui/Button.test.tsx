import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders a primary button by default', () => {
    render(<Button>Submit picks</Button>);
    const btn = screen.getByRole('button', { name: 'Submit picks' });
    expect(btn).toHaveClass('btn', 'btn-primary');
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('supports the secondary and ghost variants', () => {
    render(
      <>
        <Button variant="secondary">Edit</Button>
        <Button variant="ghost">Copy</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveClass('btn-secondary');
    expect(screen.getByRole('button', { name: 'Copy' })).toHaveClass('btn-ghost');
  });
});
