import { fireEvent, render, screen } from '@testing-library/react';
import { ShareBar } from './ShareBar';

const game = {
  awayTeam: 'Texans',
  homeTeam: 'Jaguars',
  awayCount: 7,
  homeCount: 29,
  awayPercent: 19,
  homePercent: 81,
};

it('shows each team with its score, the winner, your pick, and an upset in words', () => {
  const { container } = render(
    <ShareBar
      {...game}
      winner="away"
      status={{ kind: 'final', label: 'Final', awayPoints: 34, homePoints: 31 }}
      unofficial
      myPick="home"
      upset
    />,
  );
  expect(screen.getByText('34')).toBeInTheDocument();
  expect(screen.getByText('31')).toBeInTheDocument();
  expect(screen.getByText('Won')).toBeInTheDocument();
  expect(screen.getByText('Your pick')).toBeInTheDocument();
  expect(screen.getByText('Upset')).toBeInTheDocument();
  expect(screen.getByText(/Final/)).toHaveTextContent('Final (unofficial)');
  // The bar is in the teams' colours: Texans navy on the left, Jaguars teal on the right.
  const [left, right] = Array.from(container.querySelectorAll('[aria-hidden="true"] > div'));
  expect((left as HTMLElement).style.background).toBe('rgb(3, 32, 47)');
  expect((right as HTMLElement).style.background).toBe('rgb(0, 103, 120)');
});

it('shows the team badge when a logo is not there', () => {
  const { container } = render(<ShareBar {...game} />);
  const logos = container.querySelectorAll('img');
  expect(logos[0]).toHaveAttribute('src', '/teams/hou.png');
  fireEvent.error(logos[0]);
  expect(screen.getByText('hou')).toBeInTheDocument();
  expect(container.querySelectorAll('img')).toHaveLength(1);
});

it('says nothing about a score, an upset, or your pick when there is none', () => {
  render(<ShareBar {...game} />);
  expect(screen.queryByText(/Final/)).toBeNull();
  expect(screen.queryByText('Upset')).toBeNull();
  expect(screen.queryByText('Your pick')).toBeNull();
});

it('shows a game being played with its score, quarter, and clock, and says it is not counted yet', () => {
  render(
    <ShareBar
      {...game}
      status={{ kind: 'live', label: 'Q3 · 7:21', awayPoints: 17, homePoints: 14 }}
    />,
  );
  expect(screen.getByText('17')).toBeInTheDocument();
  expect(screen.getByText('Live')).toBeInTheDocument();
  expect(screen.getByText('Q3 · 7:21')).toBeInTheDocument();
  expect(screen.getByText(/Not counted until it's final/)).toBeInTheDocument();
  expect(screen.queryByText('Won')).toBeNull();
});

it('gives the kickoff before a game starts, with no score', () => {
  render(<ShareBar {...game} status={{ kind: 'upcoming', label: 'Sun 1:00 PM' }} />);
  expect(screen.getByText('Kickoff Sun 1:00 PM')).toBeInTheDocument();
  expect(screen.queryByText('Live')).toBeNull();
});
