import { signOut } from 'firebase/auth';
import { Link, NavLink, Outlet, useSearchParams } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import { useAuth } from '../auth/useAuth';
import { usePendingClaimCount } from './claims/claimsData';

const NAV = [
  { to: '/admin', label: 'Payments', end: true },
  { to: '/admin/roster', label: 'Roster', end: false },
  { to: '/admin/claims', label: 'Claims', end: false },
  { to: '/admin/results', label: 'Results', end: false },
  { to: '/admin/weeks', label: 'Weeks', end: false },
  { to: '/admin/reports', label: 'Reports', end: false },
  { to: '/admin/settings', label: 'Settings', end: false },
];

/** Back Office shell (DESIGN_SYSTEM §7): plain condensed headings, neutral page, wide max width. */
export function AdminLayout() {
  const { user } = useAuth();
  // The production test run lives in its own season (?season=2026-test): keep it while navigating.
  const season = useSearchParams()[0].get('season');
  const suffix = season ? `?season=${encodeURIComponent(season)}` : '';
  const pendingClaims = usePendingClaimCount().data ?? 0;

  return (
    <div className="min-h-screen bg-page-backoffice">
      <header className="bg-purple-700 text-ink-inverse">
        <div className="mx-auto flex max-w-backoffice flex-wrap items-center justify-between gap-x-4 px-4 py-1">
          <Link
            to={`/admin${suffix}`}
            className="flex min-h-touch items-center font-heading text-h3"
          >
            Back Office
            {season && <span className="badge badge-pending ml-2">Test season</span>}
          </Link>
          <nav
            aria-label="Back Office"
            className="order-last -mx-2 flex w-[calc(100%+1rem)] flex-wrap items-center sm:order-none sm:mx-0 sm:w-auto"
          >
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={`${item.to}${suffix}`}
                end={item.end}
                className="flex min-h-touch items-center px-2 text-body underline-offset-4 sm:px-3 aria-[current=page]:font-semibold aria-[current=page]:underline"
              >
                {item.label}
                {item.label === 'Claims' && pendingClaims > 0 && (
                  <span className="badge badge-pending ml-1">
                    {pendingClaims}
                    <span className="sr-only"> waiting</span>
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
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
