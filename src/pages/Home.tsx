import { Link } from 'react-router-dom';
import { useGuestSession } from '../features/auth/useAuth';

export default function Home() {
  // Every player is signed in, as a guest if nothing else, before they make picks (Sprint 2).
  const { user } = useGuestSession();

  return (
    <main className="bg-gameday min-h-screen px-4 pb-16 pt-10 text-center">
      <div className="mx-auto max-w-player">
        <h1 className="sr-only">Tunas Weekly Football Pool Pick 'Em</h1>
        <p className="wordmark text-wordmark" aria-hidden="true">
          Tunas
        </p>
        <p className="ribbon my-3 text-xl" aria-hidden="true">
          Weekly Football Pool
        </p>
        <p className="wordmark text-wordmark" aria-hidden="true">
          Pick&#8209;Em
        </p>
        <p className="mt-8 font-heading text-h3 text-ink-inverse">Entries are coming soon.</p>
        {user && !user.isAnonymous ? (
          <p className="mt-8 text-body text-ink-inverse">Signed in as {user.email}</p>
        ) : (
          <Link
            to="/account"
            className="mt-8 inline-flex min-h-touch items-center text-body text-ink-inverse underline"
          >
            Played on another phone? Sign in with email
          </Link>
        )}
      </div>
    </main>
  );
}
