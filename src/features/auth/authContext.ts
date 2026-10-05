import { createContext } from 'react';
import type { User } from 'firebase/auth';

export interface AuthState {
  user: User | null;
  /** True when the ID token carries the `admin` custom claim (CLAUDE.md §4.7). */
  isAdmin: boolean;
  /** False until Firebase has restored (or ruled out) a saved session. */
  ready: boolean;
}

export const AuthContext = createContext<AuthState>({ user: null, isAdmin: false, ready: false });
