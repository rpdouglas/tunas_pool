import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import SaveAccount from './pages/SaveAccount';
import FinishSignIn from './pages/FinishSignIn';
import EntryPage from './features/entry/EntryPage';
const Styleguide = lazy(() => import('./pages/Styleguide'));
import NotFound from './pages/NotFound';
import { AdminLayout } from './features/admin/AdminLayout';

// Admin screens and the styleguide load on demand, so players on a weak signal download less.
import { RequireAdmin } from './features/admin/RequireAdmin';
const WeeksPage = lazy(() => import('./features/admin/weeks/WeeksPage'));
const PaymentsPage = lazy(() => import('./features/admin/payments/PaymentsPage'));
const ResultsPage = lazy(() => import('./features/admin/results/ResultsPage'));
const WeekEditorPage = lazy(() => import('./features/admin/weeks/WeekEditorPage'));
const PoolSettingsPage = lazy(() => import('./features/admin/settings/PoolSettingsPage'));
const RosterPage = lazy(() => import('./features/admin/roster/RosterPage'));
const PaperEntryPage = lazy(() => import('./features/admin/entries/PaperEntryPage'));

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
        <Route path="/account" element={<SaveAccount />} />
        <Route path="/auth/finish" element={<FinishSignIn />} />
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
          <Route path="enter/:playerId" element={<PaperEntryPage />} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="weeks" element={<WeeksPage />} />
          <Route path="weeks/:year/:weekId" element={<WeekEditorPage />} />
          <Route path="settings" element={<PoolSettingsPage />} />
        </Route>
        {showStyleguide && <Route path="/styleguide" element={<Styleguide />} />}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
