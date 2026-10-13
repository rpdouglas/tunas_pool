/**
 * One-off: set a staff role on a Firebase Auth user (D-095).
 *   npm run admin:claim -- <uid>            the commissioner: full admin
 *   npm run admin:claim -- <uid> counter    Devon, the counter role: daily work only
 *   npm run admin:claim -- <uid> none       take either role away
 * Other claims on the account are kept. A counter is never made out of an admin by accident:
 * that would take the commissioner's access away, so it needs `none` first.
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
const role = process.argv[3] ?? 'admin';
if (!uid || !['admin', 'counter', 'none'].includes(role)) {
  console.error('Usage: npm run admin:claim -- <uid> [admin|counter|none]   (default: admin)');
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
  const existing = (await getAuth().getUser(uid)).customClaims ?? {};
  const others: Record<string, unknown> = { ...existing };
  const wasAdmin = others.admin;
  delete others.admin;
  delete others.counter;
  if (role === 'counter' && wasAdmin === true) {
    console.error(
      `${uid} is the commissioner. Making them a counter would take their admin access away.\nIf that is what you want, run it with "none" first, then "counter".`,
    );
    process.exit(1);
  }
  const claims: Record<string, unknown> =
    role === 'admin'
      ? { ...others, admin: true }
      : role === 'counter'
        ? { ...others, counter: true }
        : others;
  await getAuth().setCustomUserClaims(uid, claims);
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

const done = {
  admin: 'Admin claim set',
  counter: 'Counter claim set',
  none: 'Staff roles removed',
}[role];
console.log(
  `${done} for ${uid} in ${projectId ?? EMULATOR_PROJECT}${usingEmulator ? ' (emulator)' : ''}. Tap "Check again" on /admin (or /counter), or sign out and back in, to refresh the token.`,
);
