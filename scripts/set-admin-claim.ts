/**
 * One-off: grant the admin custom claim to a Firebase Auth user.
 *   npm run admin:claim -- <uid>
 * For the live pool, both a project and credentials are required:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json GCLOUD_PROJECT=lilypad-strategy-design npm run admin:claim -- <uid>
 * That project is shared (DECISIONS.md D-015), so the claim is visible to every app in it.
 * Keep the key outside the repo and never commit it.
 * For local work, run against the Auth emulator instead (no key needed):
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run admin:claim -- <uid>
 * The user taps "Check again" on /admin (or signs out and back in) to pick up the claim.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const EMULATOR_PROJECT = 'demo-tunas-pool';

const uid = process.argv[2];
if (!uid) {
  console.error('Usage: npm run admin:claim -- <uid>');
  process.exit(1);
}

const usingEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
const projectId = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT;

if (!usingEmulator && !projectId) {
  console.error(
    [
      'No project set, so there is nowhere to grant the claim.',
      '  Live pool: GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json GCLOUD_PROJECT=lilypad-strategy-design npm run admin:claim -- <uid>',
      '  Emulator:  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run admin:claim -- <uid>',
    ].join('\n'),
  );
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
  projectId: projectId ?? EMULATOR_PROJECT,
});

try {
  await getAuth().setCustomUserClaims(uid, { admin: true });
} catch (err) {
  const code = (err as { code?: string }).code;
  if (code === 'app/invalid-credential') {
    console.error(
      [
        `No usable credentials for ${projectId}.`,
        'Download a service-account key (Firebase console > Project settings > Service accounts),',
        'save it outside the repo, and point GOOGLE_APPLICATION_CREDENTIALS at it:',
        `  GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json GCLOUD_PROJECT=${projectId} npm run admin:claim -- ${uid}`,
      ].join('\n'),
    );
    process.exit(1);
  }
  if (code === 'auth/user-not-found') {
    console.error(
      `No user with uid ${uid} in ${projectId ?? EMULATOR_PROJECT}. Check the uid and the project.`,
    );
    process.exit(1);
  }
  throw err;
}

console.log(
  `Admin claim set for ${uid} in ${projectId ?? EMULATOR_PROJECT}${usingEmulator ? ' (emulator)' : ''}. Tap "Check again" on /admin, or sign out and back in, to refresh the token.`,
);
