import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KioskPinPad } from './KioskPinPad';

describe('KioskPinPad', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  it('renders label and 12 keypad buttons', () => {
    render(<KioskPinPad label="Enter PIN" onComplete={() => {}} />);
    expect(screen.getByText('Enter PIN')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('collects 4 digits and triggers onComplete', () => {
    const onComplete = vi.fn();
    render(<KioskPinPad onComplete={onComplete} />);

    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    fireEvent.click(screen.getByText('3'));
    fireEvent.click(screen.getByText('4'));

    vi.advanceTimersByTime(100);
    expect(onComplete).toHaveBeenCalledWith('1234');
  });

  it('allows backspace and clear', () => {
    const onComplete = vi.fn();
    render(<KioskPinPad onComplete={onComplete} />);

    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    fireEvent.click(screen.getByLabelText('Backspace'));
    fireEvent.click(screen.getByText('3'));
    fireEvent.click(screen.getByLabelText('Clear PIN'));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('6'));
    fireEvent.click(screen.getByText('7'));
    fireEvent.click(screen.getByText('8'));

    vi.advanceTimersByTime(100);
    expect(onComplete).toHaveBeenCalledWith('5678');
  });

  it('displays error messages when provided', () => {
    render(<KioskPinPad onComplete={() => {}} error="Incorrect PIN. 3 attempts remaining." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect PIN. 3 attempts remaining.');
  });
});
