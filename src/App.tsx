import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import SaveAccount from './pages/SaveAccount';
import FinishSignIn from './pages/FinishSignIn';
import EntryPage from './features/entry/EntryPage';
const ClaimPage = lazy(() => import('./features/claims/ClaimPage'));
const HistoryPage = lazy(() => import('./features/claims/HistoryPage'));
const WeekPage = lazy(() => import('./features/leaderboard/WeekPage'));
const StandingsPage = lazy(() => import('./features/leaderboard/StandingsPage'));
const HallOfFamePage = lazy(() => import('./features/leaderboard/HallOfFamePage'));
const PlayerPage = lazy(() => import('./features/leaderboard/PlayerPage'));
const SheetPage = lazy(() => import('./features/print/SheetPage'));
const ResultsSheetPage = lazy(() => import('./features/print/ResultsSheetPage'));
const Styleguide = lazy(() => import('./pages/Styleguide'));
// Tunas 649 Bingo: its own chunk, linked from nowhere (D-128).
const BingoRoutes = lazy(() => import('./features/bingo/BingoRoutes'));
const BingoStaffRoutes = lazy(() => import('./features/bingo/staff/BingoStaffRoutes'));
// The guide (D-136): its own chunk, for players, the commissioner, and the counter.
const HelpRoutes = lazy(() => import('./features/help/HelpRoutes'));
import NotFound from './pages/NotFound';
import { AdminLayout } from './features/admin/AdminLayout';
import { CounterLayout } from './features/counter/CounterLayout';

// Admin screens and the styleguide load on demand, so players on a weak signal download less.
import { RequireAdmin } from './features/admin/RequireAdmin';
const WeeksPage = lazy(() => import('./features/admin/weeks/WeeksPage'));
const PaymentsPage = lazy(() => import('./features/admin/payments/PaymentsPage'));
const ResultsPage = lazy(() => import('./features/admin/results/ResultsPage'));
const WeekEditorPage = lazy(() => import('./features/admin/weeks/WeekEditorPage'));
const PoolSettingsPage = lazy(() => import('./features/admin/settings/PoolSettingsPage'));
// Devon's screens (D-095): the counter role, and the commissioner too.
const CounterPage = lazy(() => import('./features/counter/CounterPage'));
const CounterEnterPage = lazy(() => import('./features/counter/CounterEnterPage'));
const RosterPage = lazy(() => import('./features/admin/roster/RosterPage'));
const ClaimsPage = lazy(() => import('./features/admin/claims/ClaimsPage'));
const ReportsPage = lazy(() => import('./features/admin/reports/ReportsPage'));
const AuditPage = lazy(() => import('./features/admin/audit/AuditPage'));
const SeasonsPage = lazy(() => import('./features/admin/seasons/SeasonsPage'));
const MorePage = lazy(() => import('./features/admin/MorePage'));
const PaperEntryPage = lazy(() => import('./features/admin/entries/PaperEntryPage'));
const ImportPicksPage = lazy(() => import('./features/admin/entries/ImportPicksPage'));

// The styleguide is visible in dev, and in builds where VITE_ENABLE_STYLEGUIDE=true (CI a11y checks).
const showStyleguide = import.meta.env.DEV || import.meta.env.VITE_ENABLE_STYLEGUIDE === 'true';

export default function App() {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-4 text-body">
          Loading…
        </p>
      }
    >
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/picks/:year/:weekId" element={<EntryPage />} />
        <Route path="/week/:year/:weekId" element={<WeekPage />} />
        <Route path="/sheet/:year/:weekId" element={<SheetPage />} />
        <Route path="/sheet/:year/:weekId/results" element={<ResultsSheetPage />} />
        <Route path="/standings" element={<StandingsPage />} />
        <Route path="/hall-of-fame" element={<HallOfFamePage />} />
        <Route path="/player/:playerId" element={<PlayerPage />} />
        <Route path="/account" element={<SaveAccount />} />
        <Route path="/claim" element={<ClaimPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/auth/finish" element={<FinishSignIn />} />
        <Route path="/help/*" element={<HelpRoutes shell="player" />} />
        <Route path="/b/*" element={<BingoRoutes />} />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<PaymentsPage />} />
          <Route path="roster" element={<RosterPage />} />
          <Route path="claims" element={<ClaimsPage />} />
          <Route path="enter/:playerId" element={<PaperEntryPage />} />
          <Route path="import" element={<ImportPicksPage />} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="weeks" element={<WeeksPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="seasons" element={<SeasonsPage />} />
          <Route path="more" element={<MorePage />} />
          <Route path="weeks/:year/:weekId" element={<WeekEditorPage />} />
          <Route path="settings" element={<PoolSettingsPage />} />
          <Route path="bingo/*" element={<BingoStaffRoutes base="/admin/bingo" />} />
          <Route path="help/*" element={<HelpRoutes shell="admin" />} />
        </Route>
        <Route
          path="/counter"
          element={
            <RequireAdmin staff>
              <CounterLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<CounterPage />} />
          <Route path="enter/:playerId" element={<CounterEnterPage />} />
          <Route path="bingo/*" element={<BingoStaffRoutes base="/counter/bingo" />} />
          <Route path="help/*" element={<HelpRoutes shell="counter" />} />
        </Route>
        {showStyleguide && <Route path="/styleguide" element={<Styleguide />} />}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
