import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { checkEmailStatus, type AccountAuth } from './accountStatus';

function mockAuth(knownEmails: string[]): AccountAuth {
  const set = new Set(knownEmails.map((e) => e.toLowerCase()));
  return {
    async getUserByEmail(email: string) {
      if (set.has(email.toLowerCase())) {
        return { email };
      }
      const err = new Error('User not found');
      (err as { code?: string }).code = 'auth/user-not-found';
      throw err;
    },
  };
}

describe('checkEmailStatus', () => {
  it('returns exists: true for a registered email', async () => {
    const auth = mockAuth(['player@example.com']);
    const res = await checkEmailStatus(auth, 'player@example.com');
    expect(res).toEqual({ exists: true });
  });

  it('handles case-insensitivity and whitespace', async () => {
    const auth = mockAuth(['player@example.com']);
    const res = await checkEmailStatus(auth, '  Player@Example.COM  ');
    expect(res).toEqual({ exists: true });
  });

  it('returns exists: false for an unregistered email', async () => {
    const auth = mockAuth(['player@example.com']);
    const res = await checkEmailStatus(auth, 'unknown@example.com');
    expect(res).toEqual({ exists: false });
  });

  it('throws invalid-argument for invalid email strings', async () => {
    const auth = mockAuth([]);
    await expect(checkEmailStatus(auth, '')).rejects.toBeInstanceOf(HttpsError);
    await expect(checkEmailStatus(auth, 'not-an-email')).rejects.toBeInstanceOf(HttpsError);
    await expect(checkEmailStatus(auth, 123)).rejects.toBeInstanceOf(HttpsError);
  });
});
