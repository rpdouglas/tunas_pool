import { Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import SaveAccount from './pages/SaveAccount';
import FinishSignIn from './pages/FinishSignIn';
import Styleguide from './pages/Styleguide';
import NotFound from './pages/NotFound';
import { AdminLayout } from './features/admin/AdminLayout';
import { RequireAdmin } from './features/admin/RequireAdmin';
import WeeksPage from './features/admin/weeks/WeeksPage';
import WeekEditorPage from './features/admin/weeks/WeekEditorPage';

// The styleguide is visible in dev, and in builds where VITE_ENABLE_STYLEGUIDE=true (CI a11y checks).
const showStyleguide = import.meta.env.DEV || import.meta.env.VITE_ENABLE_STYLEGUIDE === 'true';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
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
        <Route index element={<WeeksPage />} />
        <Route path="weeks/:year/:weekId" element={<WeekEditorPage />} />
      </Route>
      {showStyleguide && <Route path="/styleguide" element={<Styleguide />} />}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
