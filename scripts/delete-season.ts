/**
 * Remove a test season and everything under it (weeks, entries, payments, picks), plus its audit log
 * entries. Meant for the production test run (DECISIONS.md D-044):
 *   GCLOUD_PROJECT=lilypad-strategy-design npm run admin:delete-season -- 2026-test
 * Refuses the real seasons: only ids that end in "-test" are accepted. Needs credentials
 * (GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json, never committed), or the Firestore emulator
 * (FIRESTORE_EMULATOR_HOST=127.0.0.1:8080).
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FIRESTORE_DATABASE_ID } from '../shared/config';

const season = process.argv[2];
if (!season || !/^[A-Za-z0-9_-]+-test$/.test(season)) {
  console.error(
    'Usage: npm run admin:delete-season -- <year>-test   (only test seasons can be deleted)',
  );
  process.exit(1);
}

const app = initializeApp({
  credential: applicationDefault(),
  projectId: process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT ?? 'demo-tunas-pool',
});
const db = getFirestore(app, FIRESTORE_DATABASE_ID);

// recursiveDelete removes the document and every subcollection under it.
await db.recursiveDelete(db.doc(`seasons/${season}`));

const audit = await db.collection('auditLog').where('year', '==', season).get();
for (let i = 0; i < audit.docs.length; i += 400) {
  const batch = db.batch();
  audit.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
console.log(`Deleted season ${season} and ${audit.size} audit log entries.`);
