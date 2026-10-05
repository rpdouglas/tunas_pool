import { useEffect, useState, type ReactNode } from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { AuthContext, type AuthState } from './authContext';

/** Tracks the signed-in user and the admin claim. It never signs anyone in by itself. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, isAdmin: false, ready: false });

  useEffect(
    () =>
      onIdTokenChanged(auth, async (user) => {
        const isAdmin = user ? (await user.getIdTokenResult()).claims.admin === true : false;
        setState({ user, isAdmin, ready: true });
      }),
    [],
  );

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
