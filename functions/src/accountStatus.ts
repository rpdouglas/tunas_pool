/**
 * Account status check for magic-link sign in (D-141).
 * Checks if an email is registered in Firebase Auth so the client can generate a direct sign-in
 * link (?mode=signin) rather than attempting linkWithCredential, which burns the single-use
 * action code if the email already belongs to an existing account.
 */
import { HttpsError } from 'firebase-functions/v2/https';

export interface AccountAuth {
  getUserByEmail(email: string): Promise<unknown>;
}

export async function checkEmailStatus(
  auth: AccountAuth,
  email: unknown,
): Promise<{ exists: boolean }> {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new HttpsError('invalid-argument', 'A valid email is required.');
  }

  try {
    await auth.getUserByEmail(email.trim().toLowerCase());
    return { exists: true };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    const message = (err as { message?: string })?.message ?? '';
    if (code === 'auth/user-not-found' || message.includes('user-not-found')) {
      return { exists: false };
    }
    throw new HttpsError('internal', 'Unable to check account status.');
  }
}
