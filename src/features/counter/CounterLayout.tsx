import { lazy, Suspense } from 'react';
import { signOut } from 'firebase/auth';
import { Link, Outlet } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import { useAuth } from '../auth/useAuth';

// Bingo's "a draw is waiting" notice (R-22), in its own chunk so nothing else grows.
const BingoBanner = lazy(() => import('../bingo/staff/BingoBanner'));

/**
 * The Counter shell (D-095): Back Office look, but only what Devon needs. There is no menu of
 * admin screens, because he can't use them.
 */
export function CounterLayout() {
  const { user, isAdmin } = useAuth();
  return (
    <div className="min-h-screen bg-page-backoffice">
      <header className="bg-purple-700 text-ink-inverse">
        <div className="mx-auto flex max-w-backoffice flex-wrap items-center justify-between gap-x-4 px-4 py-1">
          <Link to="/counter" className="flex min-h-touch items-center font-heading text-h3">
            Counter
          </Link>
          <nav aria-label="Counter" className="flex flex-wrap items-center">
            <Link
              to="/counter/bingo"
              className="flex min-h-touch items-center px-2 text-body underline"
            >
              Bingo
            </Link>
            <Link to="/" className="flex min-h-touch items-center px-2 text-body underline">
              The pool
            </Link>
            {isAdmin && (
              <Link to="/admin" className="flex min-h-touch items-center px-2 text-body underline">
                Back Office
              </Link>
            )}
            <button
              type="button"
              className="min-h-touch px-2 text-body underline"
              onClick={() => signOut(auth)}
              title={user?.email ?? undefined}
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <Suspense fallback={null}>
        <BingoBanner base="/counter/bingo" />
      </Suspense>
      <main className="mx-auto max-w-backoffice px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
