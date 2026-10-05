/**
 * Google as a second way to save an account, beside the email link (D-024, D-083). A guest who
 * signs in keeps their login and their picks: the Google account is linked to the same uid. If that
 * Google account already has a pool account, the app signs in to it and the guest's profile moves
 * with them (`adoptGuestProfile`), exactly as the email link does (D-033).
 *
 * A popup, not a redirect: the redirect flow needs the sign-in helper served from the app's own
 * domain or Safari and Firefox drop the result, and that is project setup this code can't check.
 *
 * The popup helper is passed in here rather than set up with the app, so players who never tap this
 * button never download it (lib/firebase.ts, D-084).
 */
import { FirebaseError } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  linkWithPopup,
  signInWithCredential,
  signInWithPopup,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../../lib/firebase';

export type GoogleOutcome =
  | 'linked' // the guest is now an account, same login
  | 'signed_in' // signed in to an account; there were no guest picks to move
  | 'moved' // signed in to an existing account and the guest's picks moved with them
  | 'needs_admin' // both had picks: the admin combines them
  | 'cancelled'; // the player closed the Google window

const IN_USE = new Set(['auth/credential-already-in-use', 'auth/email-already-in-use']);
const CLOSED = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
]);

type MoveResult = { action: 'nothing' | 'relink' | 'needs_admin' };

export async function signInWithGoogle(): Promise<GoogleOutcome> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const current = auth.currentUser;
  try {
    if (!current?.isAnonymous) {
      await signInWithPopup(auth, provider, browserPopupRedirectResolver);
      return 'signed_in';
    }
    try {
      await linkWithPopup(current, provider, browserPopupRedirectResolver);
      return 'linked';
    } catch (err) {
      if (!(err instanceof FirebaseError) || !IN_USE.has(err.code)) throw err;
      // That Google account already has a pool account: sign in to it and bring the guest's picks.
      const credential = GoogleAuthProvider.credentialFromError(err);
      if (!credential) throw err;
      const guestIdToken = await current.getIdToken();
      await signInWithCredential(auth, credential);
      const adopt = httpsCallable<{ guestIdToken: string }, MoveResult>(
        functions,
        'adoptGuestProfile',
      );
      const { data } = await adopt({ guestIdToken });
      return data.action === 'relink'
        ? 'moved'
        : data.action === 'needs_admin'
          ? 'needs_admin'
          : 'signed_in';
    }
  } catch (err) {
    if (err instanceof FirebaseError && CLOSED.has(err.code)) return 'cancelled';
    throw err;
  }
}

/** What to tell the player, in plain words, when Google sign-in didn't work. */
export function googleErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google window. Allow pop-ups for this site and try again, or use the email link.';
    case 'auth/operation-not-supported-in-this-environment':
    case 'auth/web-storage-unsupported':
      return "Google sign-in doesn't work inside this app's browser. Open the pool in Safari or Chrome, or use the email link.";
    case 'auth/network-request-failed':
      return "Couldn't reach Google. Check your signal and try again.";
    case 'auth/operation-not-allowed':
      return "Google sign-in isn't switched on for the pool yet. Use the email link.";
    case 'auth/unauthorized-domain':
      return "Google sign-in isn't set up for this address yet. Use the email link.";
    default:
      return "Google sign-in didn't work. Try again, or use the email link.";
  }
}

export const GOOGLE_OUTCOME_TEXT: Record<Exclude<GoogleOutcome, 'cancelled'>, string> = {
  linked: "You're signed in with Google. Your picks are saved to this account.",
  signed_in: "You're signed in with Google.",
  moved: "You're signed in with Google, and the picks from this phone are now on your account.",
  needs_admin:
    "You're signed in with Google. You had picks on this phone and on your account, so the pool will put them together. Let them know.",
};
