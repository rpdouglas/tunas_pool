/**
 * Email-link sign-in, used to save a guest's picks to an account and to sign in on another phone.
 * A guest who saves their account keeps the same uid (linkWithCredential), so nothing moves. If the
 * email already has an account, we sign in to it and move the guest's profile across with the
 * `adoptGuestProfile` callable (docs/DATA_MODEL.md §5).
 */
import {
  EmailAuthProvider,
  isSignInWithEmailLink,
  linkWithCredential,
  sendSignInLinkToEmail,
  signInWithEmailLink,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../../lib/firebase';

const EMAIL_KEY = 'tunas.emailForSignIn';
/** Set when we already know the email belongs to another account, so the next link signs in. */
const GUEST_TOKEN_KEY = 'tunas.guestTokenToMove';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private browsing: the other-device screen asks for the email instead.
  }
}

export function savedEmail(): string | null {
  return read(EMAIL_KEY);
}

export function isEmailLink(href: string): boolean {
  return isSignInWithEmailLink(auth, href);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Only same-site paths are allowed as the place to land after signing in. */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

/**
 * Checks whether this email already has a saved account in Firebase Auth (D-141).
 * If the check fails (e.g. offline/network issue), returns null so caller can fall back.
 */
export async function checkEmailAccountStatus(email: string): Promise<boolean | null> {
  try {
    const fn = httpsCallable<{ email: string }, { exists: boolean }>(
      functions,
      'checkEmailAccountStatus',
    );
    const { data } = await fn({ email: email.trim() });
    return Boolean(data?.exists);
  } catch {
    return null;
  }
}

export async function sendSignInLink(
  email: string,
  next = '/',
  forcedMode?: 'signin' | 'link',
): Promise<void> {
  let mode = forcedMode;
  if (!mode) {
    const exists = await checkEmailAccountStatus(email);
    mode = exists ? 'signin' : 'link';
  }
  const url = `${window.location.origin}/auth/finish?mode=${mode}&next=${encodeURIComponent(safeNext(next))}`;
  await sendSignInLinkToEmail(auth, email.trim(), { url, handleCodeInApp: true });
  write(EMAIL_KEY, email.trim());
}

export type FinishResult =
  | { kind: 'linked' } // the guest is now an account, same uid
  | { kind: 'signed_in' } // signed in to an existing account; there were no guest picks to move
  | { kind: 'moved' } // signed in to an existing account and the guest's picks moved with them
  | { kind: 'needs_admin' } // both had picks: the admin combines them
  | { kind: 'resent' }; // the link was used up while switching accounts; a fresh one is on its way

type MoveResult = { action: 'nothing' | 'relink' | 'needs_admin' };

const IN_USE = new Set(['auth/credential-already-in-use', 'auth/email-already-in-use']);

async function signInAndMove(
  email: string,
  href: string,
  guestToken: string,
): Promise<FinishResult> {
  await signInWithEmailLink(auth, email, href);
  write(GUEST_TOKEN_KEY, null);
  const adopt = httpsCallable<{ guestIdToken: string }, MoveResult>(functions, 'adoptGuestProfile');
  const { data } = await adopt({ guestIdToken: guestToken });
  if (data.action === 'relink') return { kind: 'moved' };
  if (data.action === 'needs_admin') return { kind: 'needs_admin' };
  return { kind: 'signed_in' };
}

export async function finishSignIn(email: string, href: string): Promise<FinishResult> {
  const current = auth.currentUser;
  let result: FinishResult;

  let mode: string | null = null;
  try {
    const parsed = new URL(href);
    mode = parsed.searchParams.get('mode');
  } catch {
    mode = null;
  }

  const pendingGuestToken = read(GUEST_TOKEN_KEY);
  if (current?.isAnonymous && pendingGuestToken) {
    result = await signInAndMove(email, href, pendingGuestToken);
  } else if (mode === 'signin') {
    // We know this email already has an account (D-141).
    // Sign in directly so we NEVER burn the single-use action code with linkWithCredential.
    if (current?.isAnonymous) {
      const guestToken = await current.getIdToken();
      result = await signInAndMove(email, href, guestToken);
    } else {
      await signInWithEmailLink(auth, email, href);
      result = { kind: 'signed_in' };
    }
  } else if (current?.isAnonymous) {
    try {
      await linkWithCredential(current, EmailAuthProvider.credentialWithLink(email, href));
      result = { kind: 'linked' };
    } catch (err) {
      if (!(err instanceof FirebaseError) || !IN_USE.has(err.code)) throw err;
      const guestToken = await current.getIdToken();
      try {
        result = await signInAndMove(email, href, guestToken);
      } catch (signInErr) {
        if (!(signInErr instanceof FirebaseError) || signInErr.code !== 'auth/invalid-action-code')
          throw signInErr;
        // The failed link used up the one-time code. Send a fresh link that goes straight to sign-in.
        write(GUEST_TOKEN_KEY, guestToken);
        await sendSignInLink(email, new URL(href).searchParams.get('next') ?? '/', 'signin');
        return { kind: 'resent' };
      }
    }
  } else {
    await signInWithEmailLink(auth, email, href);
    result = { kind: 'signed_in' };
  }

  write(EMAIL_KEY, null);
  return result;
}
