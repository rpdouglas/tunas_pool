import { describe, expect, it, vi } from 'vitest';

// The module under test imports the Firebase client; these tests only cover its plain wording.
vi.mock('../../lib/firebase', () => ({ auth: {}, functions: {} }));

import { GOOGLE_OUTCOME_TEXT, googleErrorMessage } from './googleSignIn';

describe('googleErrorMessage', () => {
  it('says what happened and what to do, and always offers the email link', () => {
    for (const code of [
      'auth/popup-blocked',
      'auth/operation-not-supported-in-this-environment',
      'auth/operation-not-allowed',
      'auth/unauthorized-domain',
      'auth/something-new',
      undefined,
    ]) {
      expect(googleErrorMessage(code)).toMatch(/email link/);
    }
    expect(googleErrorMessage('auth/popup-blocked')).toMatch(/Allow pop-ups/);
    expect(googleErrorMessage('auth/operation-not-supported-in-this-environment')).toMatch(
      /Safari or Chrome/,
    );
    expect(googleErrorMessage('auth/network-request-failed')).toMatch(/Check your signal/);
  });

  it('never shows an error code or the word "error"', () => {
    for (const code of ['auth/popup-blocked', 'auth/internal-error', undefined]) {
      expect(googleErrorMessage(code)).not.toMatch(/auth\/|error/i);
    }
  });
});

describe('GOOGLE_OUTCOME_TEXT', () => {
  it('tells a guest their picks came with them', () => {
    expect(GOOGLE_OUTCOME_TEXT.linked).toMatch(/picks are saved/);
    expect(GOOGLE_OUTCOME_TEXT.moved).toMatch(/now on your account/);
    expect(GOOGLE_OUTCOME_TEXT.needs_admin).toMatch(/put them together/);
  });
});
