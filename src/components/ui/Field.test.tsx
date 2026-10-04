import { render, screen } from '@testing-library/react';
import { Field } from './Field';

describe('Field', () => {
  it('associates the label with the input', () => {
    render(<Field label="Phone" />);
    expect(screen.getByLabelText('Phone')).toBeInTheDocument();
  });

  it('announces errors and marks the input invalid', () => {
    render(<Field label="Phone" error="Phone number is too short." />);
    const input = screen.getByLabelText('Phone');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Phone number is too short.');
    expect(input.getAttribute('aria-describedby')).toContain('-error');
  });
});
