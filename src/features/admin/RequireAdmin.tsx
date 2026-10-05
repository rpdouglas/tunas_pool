import { useState, type ReactNode } from 'react';
import { signOut } from 'firebase/auth';
import { Button } from '../../components/ui/Button';
import { Panel } from '../../components/ui/Panel';
import { auth } from '../../lib/firebase';
import { EmailLinkForm } from '../auth/EmailLinkForm';
import { useAuth } from '../auth/useAuth';

/**
 * Admin screens need the `admin` custom claim (CLAUDE.md §4.7). The claim is set with
 * `npm run admin:claim`, never from the app. Rules enforce it too; this guard is for the UI.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isAdmin, ready } = useAuth();
  const [checking, setChecking] = useState(false);

  if (!ready) {
    return (
      <AdminGate>
        <p role="status" className="text-body">
          Loading…
        </p>
      </AdminGate>
    );
  }
  if (isAdmin) return <>{children}</>;

  if (user && !user.isAnonymous) {
    return (
      <AdminGate>
        <div className="flex flex-col gap-4">
          <p className="text-body">
            You're signed in as <strong>{user.email}</strong>, which isn't an admin account.
          </p>
          <p className="text-body-sm text-ink-muted">
            If admin access was just turned on for this account, check again to refresh it.
          </p>
          <Button
            variant="secondary"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              await user.getIdToken(true).finally(() => setChecking(false));
            }}
          >
            {checking ? 'Checking…' : 'Check again'}
          </Button>
          <Button variant="ghost" onClick={() => signOut(auth)}>
            Sign out
          </Button>
        </div>
      </AdminGate>
    );
  }

  return (
    <AdminGate>
      <div className="flex flex-col gap-4">
        <p className="text-body">This area is for the pool admin. Sign in with your admin email.</p>
        <EmailLinkForm next="/admin" buttonLabel="Email me a sign-in link" />
      </div>
    </AdminGate>
  );
}

function AdminGate({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-page-backoffice px-4 py-8">
      <div className="mx-auto max-w-player">
        <h1 className="mb-4 font-heading text-h2">Back Office</h1>
        <Panel>{children}</Panel>
      </div>
    </main>
  );
}
