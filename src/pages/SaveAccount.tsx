import { GameDayPage } from '../components/layout/GameDayPage';
import { Panel } from '../components/ui/Panel';
import { EmailLinkForm } from '../features/auth/EmailLinkForm';
import { useAuth } from '../features/auth/useAuth';

/** Save a guest's picks to an email, or sign in on a new phone. Optional, never a wall. */
export default function SaveAccount() {
  const { user, ready } = useAuth();
  const signedInEmail = user && !user.isAnonymous ? user.email : null;

  return (
    <GameDayPage title="Save your picks">
      <Panel>
        {!ready ? (
          <p className="text-body">Loading…</p>
        ) : signedInEmail ? (
          <p className="text-body">
            You're signed in as <strong>{signedInEmail}</strong>. Your picks are saved to this
            email.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-body">
              Get an email link so you can see your picks on any phone and keep your season record.
              There's no password.
            </p>
            <p className="text-body">
              Played on another phone before? Use the same email to sign in here.
            </p>
            <EmailLinkForm next="/" />
          </div>
        )}
      </Panel>
    </GameDayPage>
  );
}
