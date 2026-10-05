import { useContext, useEffect, useState } from 'react';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { AuthContext, type AuthState } from './authContext';

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/**
 * For player screens: makes sure there is a login, signing in as a guest if needed. Guests never see
 * a sign-in step (PERSONAS: no account walls). `failed` is true if the guest sign-in didn't work.
 */
export function useGuestSession(): AuthState & { failed: boolean } {
  const state = useAuth();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (state.ready && !state.user) {
      signInAnonymously(auth).catch(() => setFailed(true));
    }
  }, [state.ready, state.user]);

  return { ...state, failed };
}
