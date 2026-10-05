import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
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

export const auth = getAuth(app);
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
