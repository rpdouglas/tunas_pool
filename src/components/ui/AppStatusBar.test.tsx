import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppStatusBar, type AppStatusBarProps } from './AppStatusBar';

function show(props: Partial<AppStatusBarProps> = {}) {
  const onRefresh = vi.fn();
  const onLater = vi.fn();
  const { container } = render(
    <AppStatusBar
      offline={false}
      updateReady={false}
      onRefresh={onRefresh}
      onLater={onLater}
      {...props}
    />,
  );
  return { onRefresh, onLater, container };
}

describe('AppStatusBar', () => {
  it('shows nothing when online and up to date', () => {
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
  });

  it('says the phone is offline and that picks are kept', () => {
    show({ offline: true });
    expect(screen.getByRole('status')).toHaveTextContent(
      "You're offline. Your picks are saved on this phone; send them when you're back online.",
    );
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
  });

  it('offers Refresh and Later when a new version is ready', async () => {
    const { onRefresh, onLater } = show({ updateReady: true });
    expect(screen.getByText('A new version of the pool is ready.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(onLater).toHaveBeenCalledTimes(1);
  });

  it('shows both notices together', () => {
    show({ offline: true, updateReady: true });
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });
});
