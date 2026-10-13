import { useEffect, useState, type ReactNode } from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import { staffRoleOf } from '@shared/roles';
import { auth } from '../../lib/firebase';
import { AuthContext, type AuthState } from './authContext';

/** Tracks the signed-in user and their staff role. It never signs anyone in by itself. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAdmin: false,
    isCounter: false,
    ready: false,
  });

  useEffect(
    () =>
      onIdTokenChanged(auth, async (user) => {
        const role = user ? staffRoleOf((await user.getIdTokenResult()).claims) : null;
        setState({ user, isAdmin: role === 'admin', isCounter: role === 'counter', ready: true });
      }),
    [],
  );

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
