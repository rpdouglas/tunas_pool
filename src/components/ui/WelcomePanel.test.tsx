import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { WelcomePanel, type WelcomePanelProps } from './WelcomePanel';

function show(props: Partial<WelcomePanelProps> = {}) {
  const onDismiss = vi.fn();
  render(
    <MemoryRouter>
      <WelcomePanel
        fee="$20"
        lockLabel="Sat, Oct 24, 11:59 PM"
        signedIn={false}
        onDismiss={onDismiss}
        {...props}
      />
    </MemoryRouter>,
  );
  return onDismiss;
}

describe('WelcomePanel', () => {
  it('says what the pool is, that no account is needed, and offers sign-in to regulars on a new phone', () => {
    show();
    expect(screen.getByText(/The entry is \$20/)).toBeInTheDocument();
    expect(screen.getByText(/until they lock, Sat, Oct 24, 11:59 PM/)).toBeInTheDocument();
    expect(screen.getByText('No account needed.')).toBeInTheDocument();
    expect(screen.getByText(/Make your picks below/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Already play\? Sign in/ })).toHaveAttribute(
      'href',
      '/account',
    );
  });

  it('after the lock, says to come back next week instead of pointing at a button', () => {
    show({ lockLabel: null });
    expect(screen.getByText(/come back when the next week opens/)).toBeInTheDocument();
    expect(screen.queryByText(/Make your picks below/)).toBeNull();
  });

  it('offers no sign-in to someone already signed in, and can be hidden', async () => {
    const onDismiss = show({ signedIn: true });
    expect(screen.queryByRole('link', { name: /Sign in/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Got it, hide this' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
