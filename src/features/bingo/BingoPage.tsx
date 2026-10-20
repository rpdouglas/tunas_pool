import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { GameDayPage } from '../../components/layout/GameDayPage';
import type { BingoStatus } from './bingoData';

const TABS = [
  { to: '/b/cards', label: 'My cards' },
  { to: '/b/board', label: 'Board' },
  { to: '/b/history', label: 'Past games' },
  { to: '/b/rules', label: 'Rules' },
];

export function BingoNav({ member }: { member: boolean }) {
  const tabs = member ? TABS : TABS.filter((t) => t.to !== '/b/cards');
  return (
    <nav aria-label="Bingo" className="grid grid-cols-2 gap-2">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-secondary'}`}
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** A bingo screen: the Game Day shell, the bingo tabs, then the page. */
export function BingoPage({
  title,
  status,
  children,
}: {
  title: string;
  status: BingoStatus;
  children: ReactNode;
}) {
  return (
    <GameDayPage title={title}>
      {status.member || status.staff ? <BingoNav member={status.member} /> : null}
      {children}
    </GameDayPage>
  );
}
