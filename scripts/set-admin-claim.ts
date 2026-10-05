/**
 * One-off: grant the admin custom claim to a Firebase Auth user.
 *   npm run admin:claim -- <uid>
 * For the live pool: GCLOUD_PROJECT=lilypad-strategy-design npm run admin:claim -- <uid>
 * That project is shared (DECISIONS.md D-015), so the claim is visible to every app in it.
 * Needs credentials: GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json (never commit the key),
 * or run against the Auth emulator with FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099.
 * The user must sign out and back in to pick up the claim.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const uid = process.argv[2];
if (!uid) {
  console.error('Usage: npm run admin:claim -- <uid>');
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
  projectId: process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT ?? 'demo-tunas-pool',
});

await getAuth().setCustomUserClaims(uid, { admin: true });
console.log(`Admin claim set for ${uid}. Sign out and back in to refresh the token.`);
