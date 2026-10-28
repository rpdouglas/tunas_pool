import { Link } from 'react-router-dom';
import { GameDayPage } from '../components/layout/GameDayPage';
import { Panel } from '../components/ui/Panel';
import { EmailLinkForm } from '../features/auth/EmailLinkForm';
import { GoogleSignInButton } from '../features/auth/GoogleSignInButton';
import { useAuth } from '../features/auth/useAuth';
import { useMyProfile } from '../features/entry/entryData';

/** Save a guest's picks to an email, or sign in on a new phone. Optional, never a wall. */
export default function SaveAccount() {
  const { user, ready } = useAuth();
  const profile = useMyProfile(user?.uid).data ?? null;
  const signedInEmail = user && !user.isAnonymous ? user.email : null;

  return (
    <GameDayPage title="Save your picks">
      <Panel>
        {!ready ? (
          <p className="text-body">Loading…</p>
        ) : signedInEmail ? (
          <p className="text-body">
            You&apos;re signed in as <strong>{signedInEmail}</strong>. Your picks and season record
            are saved to this email.
          </p>
        ) : profile ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1 rounded-md bg-purple-50 p-3 text-body text-ink">
              <p className="font-heading text-h3 text-purple-700">
                Picks on this phone: {profile.data.displayName}
              </p>
              <p>
                Your picks and season standings are saved on this phone.{' '}
                <strong>You do not need to sign in every week to play.</strong>
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <p className="font-heading text-h3">Back up to email or Google</p>
              <p className="text-body">
                Back up your picks so you can open the pool on another phone or recover your record
                if you clear your browser.
              </p>
              <EmailLinkForm next="/" buttonLabel="Email me a backup link" />
              <p className="text-center text-body text-ink-muted">or</p>
              <GoogleSignInButton next="/" />
            </div>

            <div className="border-t border-divider pt-3 flex flex-col gap-1">
              <p className="font-heading text-h3">Played with a different email before?</p>
              <p className="text-body text-ink-muted">
                Entering that email above will sign you in and combine any picks from this phone.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-body">
              Save your picks to an email or a Google account so you can see them on any phone and
              keep your season record. There&apos;s no password to remember.
            </p>
            <p className="text-body">
              Played on another phone before? Use the same email to sign in here.
            </p>
            <EmailLinkForm next="/" />
            <p className="text-center text-body text-ink-muted">or</p>
            <GoogleSignInButton next="/" />
          </div>
        )}
      </Panel>
      <Panel>
        <Link
          to="/help/home-screen"
          className="inline-flex min-h-touch items-center text-body text-ink-emphasis underline"
        >
          Put the pool on your home screen
        </Link>
      </Panel>
    </GameDayPage>
  );
}
