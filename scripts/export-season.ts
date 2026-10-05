/**
 * Save a copy of one season to a file on this machine (PROJECT_PLAN Sprint 9): the season, its
 * weeks, every entry with its picks and payment, the standings, the players who entered, and the
 * season's audit log. A plain JSON file, readable without the site.
 *
 *   GCLOUD_PROJECT=lilypad-strategy-design npm run admin:export -- 2026
 *
 * The file holds phone numbers and payments, so it is written to backups/ (never committed) and is
 * yours to keep safe. It is a copy to read or rebuild from by hand, not a one-command restore; the
 * database's own scheduled backups are the restore path (README).
 *
 * Needs credentials like delete-season.ts, or the Firestore emulator (FIRESTORE_EMULATOR_HOST).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { FIRESTORE_DATABASE_ID } from '../shared/config';

const year = process.argv[2];
if (!year || !/^[A-Za-z0-9_-]+$/.test(year)) {
  console.error('Usage: npm run admin:export -- <season>   (for example 2026)');
  process.exit(1);
}

const app = initializeApp({
  credential: applicationDefault(),
  projectId: process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT ?? 'demo-tunas-pool',
});
const db = getFirestore(app, FIRESTORE_DATABASE_ID);

const season = await db.doc(`seasons/${year}`).get();
const weeks: DocumentData[] = [];
const playerIds = new Set<string>();
for (const week of (await db.collection(`seasons/${year}/weeks`).orderBy('weekNumber').get())
  .docs) {
  const entries = [];
  for (const entry of (await week.ref.collection('entries').get()).docs) {
    playerIds.add(entry.id);
    const [picks, payment] = await Promise.all([
      entry.ref.collection('private').doc('picks').get(),
      entry.ref.collection('payment').doc('current').get(),
    ]);
    entries.push({
      playerId: entry.id,
      ...entry.data(),
      picks: picks.data() ?? null,
      payment: payment.data() ?? null,
    });
  }
  weeks.push({ weekId: week.id, ...week.data(), entries });
}
const standings = (await db.collection(`seasons/${year}/standings`).get()).docs.map((d) => ({
  playerId: d.id,
  ...d.data(),
}));
const ids = [...playerIds];
const players = ids.length
  ? (await db.getAll(...ids.map((id) => db.doc(`players/${id}`)))).map((d) => ({
      playerId: d.id,
      ...d.data(),
    }))
  : [];
const auditLog = (await db.collection('auditLog').where('year', '==', year).get()).docs.map(
  (d) => ({
    id: d.id,
    ...d.data(),
  }),
);

mkdirSync('backups', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = `backups/${year}-${stamp}.json`;
// Timestamps are written as ISO text so the file reads the same anywhere.
const plain = (_key: string, value: unknown) =>
  value && typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function'
    ? (value as { toDate(): Date }).toDate().toISOString()
    : value;
writeFileSync(
  file,
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      year,
      season: season.data() ?? null,
      weeks,
      standings,
      players,
      auditLog,
    },
    plain,
    2,
  ),
);
const entryCount = weeks.reduce((sum, w) => sum + w.entries.length, 0);
console.log(
  `Saved ${file}: ${weeks.length} weeks, ${entryCount} entries, ${players.length} players, ${auditLog.length} audit entries.`,
);
