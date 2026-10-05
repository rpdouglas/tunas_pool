import { signOut } from 'firebase/auth';
import { Link, Outlet } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import { useAuth } from '../auth/useAuth';

/** Back Office shell (DESIGN_SYSTEM §7): plain condensed headings, neutral page, wide max width. */
export function AdminLayout() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-page-backoffice">
      <header className="bg-purple-700 text-ink-inverse">
        <div className="mx-auto flex max-w-backoffice items-center justify-between gap-4 px-4 py-2">
          <Link to="/admin" className="flex min-h-touch items-center font-heading text-h3">
            Back Office
          </Link>
          <button
            type="button"
            className="min-h-touch px-2 text-body underline"
            onClick={() => signOut(auth)}
            title={user?.email ?? undefined}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-backoffice px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
