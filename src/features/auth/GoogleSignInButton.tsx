import { useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { isInAppBrowser } from '../../lib/inAppBrowser';
import {
  GOOGLE_OUTCOME_TEXT,
  googleErrorMessage,
  signInWithGoogle,
  type GoogleOutcome,
} from './googleSignIn';

/**
 * "Continue with Google", beside the email link (D-083). After it works it says what happened to the
 * player's picks and offers the way on. The name only, no logo: the design system has no third-party
 * marks.
 */
export function GoogleSignInButton({ next = '/', onDone }: { next?: string; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Exclude<GoogleOutcome, 'cancelled'> | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithGoogle();
      if (result !== 'cancelled') {
        setOutcome(result);
        onDone?.();
      }
    } catch (err) {
      setError(googleErrorMessage(err instanceof FirebaseError ? err.code : undefined));
    } finally {
      setBusy(false);
    }
  }

  // Google refuses to sign in inside another app's browser, so don't offer a button that can't work.
  if (!outcome && isInAppBrowser(navigator.userAgent)) {
    return (
      <p className="rounded-md bg-surface-tint p-3 text-body">
        <span aria-hidden="true">ⓘ </span>
        You're in an app's built-in browser. To sign in with Google, open the pool in Safari or
        Chrome (tap the menu, then "Open in browser"). The email link works from here: when you open
        the link, type your email again if it asks.
      </p>
    );
  }

  if (outcome) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <p className="text-body">
          <span aria-hidden="true">✓ </span>
          {GOOGLE_OUTCOME_TEXT[outcome]}
        </p>
        <Link to={next} className="btn btn-primary">
          Continue
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" disabled={busy} onClick={go}>
        {busy ? 'Waiting for Google…' : 'Continue with Google'}
      </Button>
      {error && (
        <p role="alert" className="text-body-sm font-semibold text-ink-urgent">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
    </div>
  );
}
