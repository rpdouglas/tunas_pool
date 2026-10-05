import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { FIRESTORE_DATABASE_ID, FUNCTIONS_REGION } from '@shared/config';

// Builds without web config (CI's verify build and the /styleguide accessibility build) fall back to
// the emulator-only demo project, so the app still starts. Production deploys always write the real
// config first (scripts/write-web-env.mjs).
const env = import.meta.env;
const hasConfig = Boolean(env.VITE_FIREBASE_API_KEY);
export const app = initializeApp(
  hasConfig
    ? {
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: env.VITE_FIREBASE_APP_ID,
      }
    : {
        apiKey: 'demo-api-key',
        projectId: 'demo-tunas-pool',
        authDomain: 'demo-tunas-pool.firebaseapp.com',
      },
);

/**
 * Auth without the popup-and-redirect helper. `getAuth()` bundles it and fetches Google's sign-in
 * frame (about 130 KB) on every page load, for every player. Only "Continue with Google" needs it,
 * and that passes the helper in itself (features/auth/googleSignIn.ts). Same saved-session storage
 * as `getAuth()`, so nobody is signed out by this (D-084).
 */
function createAuth(): Auth {
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
    });
  } catch {
    return getAuth(app); // already set up (a hot reload in development)
  }
}
export const auth = createAuth();
export const db = getFirestore(app, FIRESTORE_DATABASE_ID);
export const functions = getFunctions(app, FUNCTIONS_REGION);

// Emulator wiring for localhost. NOTE: in a browser-based Codespace, localhost ports are not
// reachable from the browser tab unless you use VS Code desktop port forwarding. See README.
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

// Storage (paper-sheet photos) is loaded on demand by src/lib/paperPhotos.ts, so the player bundle
// doesn't carry it (DECISIONS D-029).
