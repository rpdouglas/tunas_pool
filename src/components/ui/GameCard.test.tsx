import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameCard } from './GameCard';

it('shows each team with its logo, and fills the picked team with its colour and readable ink', async () => {
  const onPick = vi.fn();
  const { rerender, container } = render(
    <GameCard away="Texans" home="Jaguars" kickoffLabel="Sun 1:00 PM" onPick={onPick} />,
  );
  expect(container.querySelectorAll('img')).toHaveLength(2);
  const jaguars = screen.getByRole('button', { name: 'Jaguars' });
  expect(jaguars).toHaveAttribute('aria-pressed', 'false');
  expect(jaguars.style.background).toBe('');

  await userEvent.click(jaguars);
  expect(onPick).toHaveBeenCalledWith('home');

  rerender(
    <GameCard
      away="Texans"
      home="Jaguars"
      kickoffLabel="Sun 1:00 PM"
      pick="home"
      onPick={onPick}
    />,
  );
  const picked = screen.getByRole('button', { name: 'Jaguars' });
  expect(picked).toHaveAttribute('aria-pressed', 'true');
  expect(picked.style.background).toBe('rgb(0, 103, 120)'); // Jaguars teal
  expect(picked.style.color).toBe('rgb(255, 255, 255)');
  // Tap again to clear.
  await userEvent.click(picked);
  expect(onPick).toHaveBeenLastCalledWith(null);
});

it('a light team colour gets black ink', () => {
  render(
    <GameCard away="Steelers" home="Saints" kickoffLabel="Sun" pick="home" onPick={() => {}} />,
  );
  expect(screen.getByRole('button', { name: 'Saints' }).style.color).toBe('rgb(0, 0, 0)');
});

it('a read-only card keeps the plain locked look, without team colours', () => {
  render(<GameCard away="Chiefs" home="Chargers" kickoffLabel="Mon" pick="away" />);
  const chiefs = screen.getByRole('button', { name: 'Chiefs' });
  expect(chiefs).toBeDisabled();
  expect(chiefs.style.background).toBe('');
});
