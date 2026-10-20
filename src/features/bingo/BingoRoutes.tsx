/**
 * Tunas 649 Bingo, the player side (BINGO_PLAN S14). One lazy chunk, so pool players never
 * download it (D-128). Not linked from anywhere and marked `noindex`. While bingo is off it shows
 * only to staff and existing members (the dry run, D-132); everyone else gets "not found".
 */
import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { GameDayPage } from '../../components/layout/GameDayPage';
import { Panel } from '../../components/ui/Panel';
import NotFound from '../../pages/NotFound';
import { useGuestSession } from '../auth/useAuth';
import { useBingoStatus } from './bingoData';
import BingoJoinPage from './BingoJoinPage';
import BingoCardsPage from './BingoCardsPage';
import BingoBoardPage from './BingoBoardPage';
import BingoHistoryPage from './BingoHistoryPage';
import BingoRulesPage from './BingoRulesPage';

/** Keep search engines out of every bingo page (D-128). */
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

export default function BingoRoutes() {
  useNoIndex();
  const session = useGuestSession();
  const status = useBingoStatus(session.user?.uid);

  if (session.failed || status.isError) {
    return (
      <GameDayPage title="Bingo">
        <Panel>
          <p role="alert" className="text-body">
            This page didn't load. Check your signal and refresh.
          </p>
        </Panel>
      </GameDayPage>
    );
  }
  if (!status.data) {
    return (
      <GameDayPage title="Bingo">
        <Panel>
          <p role="status" className="text-body">
            Loading…
          </p>
        </Panel>
      </GameDayPage>
    );
  }
  const s = status.data;
  if (!s.visible) return <NotFound />;
  const memberOnly = (el: ReactNode) => (s.member ? el : <Navigate to="/b" replace />);
  const seeGame = (el: ReactNode) => (s.member || s.staff ? el : <Navigate to="/b" replace />);
  return (
    <Routes>
      <Route
        index
        element={s.member ? <Navigate to="/b/cards" replace /> : <BingoJoinPage status={s} />}
      />
      <Route path="cards" element={memberOnly(<BingoCardsPage status={s} />)} />
      <Route path="board" element={seeGame(<BingoBoardPage status={s} />)} />
      <Route path="history" element={seeGame(<BingoHistoryPage status={s} />)} />
      <Route path="rules" element={<BingoRulesPage status={s} />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
