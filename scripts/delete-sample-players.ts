/**
 * Delete sample and test player accounts from the pool (D-143).
 *
 * Scans `players` in `db-tunaspool` for accounts where `notes` contains "sample" or "test"
 * (case-insensitive substring match).
 *
 * For each matched player, cascade-deletes:
 *   - `players/{playerId}` and its `stats` subcollections
 *   - `seasons/{year}/weeks/{weekId}/entries/{playerId}` across all weeks (including `private/picks` and payments)
 *   - `bingoCards` and `bingoMembers/{playerId}`
 *   - `claims` pointing to the player
 *   - `boardMutes/{playerId}`
 *   - Firebase Auth login if `claimedByUid` is set
 *   - Writes an `auditLog` entry with action `player.delete`
 *
 * Then triggers `recountWeek` and `recomputeStandings` for any affected weeks/seasons.
 *
 * Safety:
 *   Runs in DRY-RUN mode by default. Shows a table of candidate accounts and associated records.
 *   Pass `--confirm` to perform the actual deletions.
 *
 * Usage:
 *   Live:     GCLOUD_PROJECT=lilypad-strategy-design npm run admin:delete-sample-players
 *   Live fix: GCLOUD_PROJECT=lilypad-strategy-design npm run admin:delete-sample-players -- --confirm
 *   Emulator: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run admin:delete-sample-players
 */
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { type Auth, getAuth } from 'firebase-admin/auth';
import { type Firestore, getFirestore } from 'firebase-admin/firestore';
import { FIRESTORE_DATABASE_ID } from '../shared/config';
import { recomputeStandings } from '../functions/src/season';
import { recountWeek } from '../functions/src/weekCounters';

export interface SamplePlayerCandidate {
  playerId: string;
  displayName: string;
  notes: string;
  origin: string;
  claimedByUid: string | null;
  entries: { year: string; weekId: string; path: string }[];
  bingoCards: string[];
  isBingoMember: boolean;
  claims: string[];
}

export interface DeleteSamplePlayersSummary {
  dryRun: boolean;
  foundCount: number;
  deletedPlayers: number;
  deletedEntries: number;
  deletedBingoCards: number;
  deletedBingoMembers: number;
  deletedClaims: number;
  deletedAuthUsers: number;
  recountedWeeks: { year: string; weekId: string }[];
  recomputedSeasons: string[];
}

/** Default filter matches "sample" or "test" anywhere in the notes. */
export const DEFAULT_NOTE_PATTERN = /sample|test/i;

/** Find all candidate players whose notes match the pattern, and gather their associated record counts. */
export async function findSamplePlayers(
  db: Firestore,
  filter: RegExp = DEFAULT_NOTE_PATTERN,
): Promise<SamplePlayerCandidate[]> {
  const playersSnap = await db.collection('players').get();
  const matchedPlayers: { id: string; data: Record<string, unknown> }[] = [];

  for (const doc of playersSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const notes = typeof data.notes === 'string' ? data.notes : '';
    if (filter.test(notes)) {
      matchedPlayers.push({ id: doc.id, data });
    }
  }

  if (matchedPlayers.length === 0) return [];

  // Query all weeks across all seasons to discover entries for candidate players
  const weekDocs = (await db.collectionGroup('weeks').select().get()).docs;

  const candidates: SamplePlayerCandidate[] = [];

  for (const { id: playerId, data } of matchedPlayers) {
    // Check entries for this player in all weeks
    const entrySnaps = await Promise.all(
      weekDocs.map(async (weekDoc) => {
        const entryRef = weekDoc.ref.collection('entries').doc(playerId);
        const entrySnap = await entryRef.get();
        if (entrySnap.exists) {
          const weekId = weekDoc.id;
          const year = weekDoc.ref.parent.parent!.id;
          return { year, weekId, path: entryRef.path };
        }
        return null;
      }),
    );
    const entries = entrySnaps.filter((e): e is NonNullable<typeof e> => e !== null);

    // Check bingo cards
    const bingoCardsSnap = await db
      .collection('bingoCards')
      .where('playerId', '==', playerId)
      .select()
      .get();
    const bingoCards = bingoCardsSnap.docs.map((d) => d.id);

    // Check bingo membership
    const bingoMemberSnap = await db.doc(`bingoMembers/${playerId}`).get();
    const isBingoMember = bingoMemberSnap.exists;

    // Check claims
    const [claimsBySuggested, claimsByPlayer] = await Promise.all([
      db.collection('claims').where('suggestedPlayerId', '==', playerId).select().get(),
      db.collection('claims').where('playerId', '==', playerId).select().get(),
    ]);
    const claimIds = [
      ...new Set([...claimsBySuggested.docs, ...claimsByPlayer.docs].map((d) => d.id)),
    ];

    candidates.push({
      playerId,
      displayName: String(data.displayName ?? playerId),
      notes: String(data.notes ?? ''),
      origin: String(data.origin ?? 'admin'),
      claimedByUid: (data.claimedByUid as string | null) ?? null,
      entries,
      bingoCards,
      isBingoMember,
      claims: claimIds,
    });
  }

  return candidates;
}

/** Execute cascade deletion for candidate sample players. */
export async function executeDeleteSamplePlayers(
  db: Firestore,
  auth: Auth | null,
  candidates: SamplePlayerCandidate[],
): Promise<DeleteSamplePlayersSummary> {
  const summary: DeleteSamplePlayersSummary = {
    dryRun: false,
    foundCount: candidates.length,
    deletedPlayers: 0,
    deletedEntries: 0,
    deletedBingoCards: 0,
    deletedBingoMembers: 0,
    deletedClaims: 0,
    deletedAuthUsers: 0,
    recountedWeeks: [],
    recomputedSeasons: [],
  };

  const affectedWeeks = new Map<string, { year: string; weekId: string }>();
  const affectedSeasons = new Set<string>();

  for (const candidate of candidates) {
    const { playerId, displayName, claimedByUid, entries, bingoCards, isBingoMember, claims } =
      candidate;

    // 1. Delete weekly pool entries (and subcollections private/picks, payments)
    for (const entry of entries) {
      await db.recursiveDelete(db.doc(entry.path));
      summary.deletedEntries++;
      const weekKey = `${entry.year}/${entry.weekId}`;
      affectedWeeks.set(weekKey, { year: entry.year, weekId: entry.weekId });
      affectedSeasons.add(entry.year);
    }

    // 2. Delete bingo cards
    for (const cardId of bingoCards) {
      await db.doc(`bingoCards/${cardId}`).delete();
      summary.deletedBingoCards++;
    }

    // 3. Delete bingo membership
    if (isBingoMember) {
      await db.doc(`bingoMembers/${playerId}`).delete();
      summary.deletedBingoMembers++;
    }

    // 4. Delete claims
    for (const claimId of claims) {
      await db.doc(`claims/${claimId}`).delete();
      summary.deletedClaims++;
    }

    // 5. Delete board mutes if present
    const muteRef = db.doc(`boardMutes/${playerId}`);
    const muteSnap = await muteRef.get();
    if (muteSnap.exists) {
      await muteRef.delete();
    }

    // 6. Delete Firebase Auth user if linked
    if (claimedByUid && auth) {
      try {
        await auth.deleteUser(claimedByUid);
        summary.deletedAuthUsers++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        // User might already be gone from Auth; that's fine
        if (!message.includes('user-not-found')) {
          console.warn(`Could not delete Auth UID ${claimedByUid} for ${displayName}: ${message}`);
        }
      }
    }

    // 7. Delete player profile and its subcollections (stats, etc.)
    await db.recursiveDelete(db.doc(`players/${playerId}`));
    summary.deletedPlayers++;

    // 8. Write audit log entry
    await db.collection('auditLog').add({
      at: new Date(),
      actorUid: 'admin:script:delete-sample-players',
      action: 'player.delete',
      target: `players/${playerId}`,
      before: {
        displayName,
        origin: candidate.origin,
        notes: candidate.notes,
        hadEntries: entries.length,
        hadBingoCards: bingoCards.length,
        claimedByUid,
      },
      after: null,
      reason: 'Maintenance cleanup of sample/test account',
    });
  }

  // Recount affected weeks
  for (const week of affectedWeeks.values()) {
    try {
      await recountWeek(db, week.year, week.weekId);
      summary.recountedWeeks.push(week);
    } catch (err) {
      console.warn(`Could not recount week ${week.year}/${week.weekId}:`, err);
    }
  }

  // Recompute standings for affected seasons
  for (const year of affectedSeasons) {
    try {
      const savedLogins = async (uids: string[]) => {
        if (!auth) return new Set(uids);
        const users = await Promise.all(
          uids.map((uid) =>
            auth.getUser(uid).then(
              (u) => ({ uid, anonymous: u.providerData.length === 0 }),
              () => null,
            ),
          ),
        );
        return new Set(users.filter((u) => u && !u.anonymous).map((u) => u!.uid));
      };
      await recomputeStandings(db, year, savedLogins);
      summary.recomputedSeasons.push(year);
    } catch (err) {
      console.warn(`Could not recompute standings for season ${year}:`, err);
    }
  }

  return summary;
}

// CLI entry point
async function main() {
  const isConfirm = process.argv.includes('--confirm');
  const projectId = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT ?? 'demo-tunas-pool';

  console.log(`\n=== Tunas Pool Sample Account Cleanup ===`);
  console.log(`Project:  ${projectId}`);
  console.log(`Database: ${FIRESTORE_DATABASE_ID}`);
  console.log(`Mode:     ${isConfirm ? 'EXECUTE (Destructive Deletion)' : 'DRY RUN (Preview Only)'}\n`);

  const app =
    getApps().length === 0
      ? initializeApp({
          credential: applicationDefault(),
          projectId,
        })
      : getApps()[0];

  const db = getFirestore(app, FIRESTORE_DATABASE_ID);
  const auth = getAuth(app);

  console.log('Searching for sample/test player accounts...');
  const candidates = await findSamplePlayers(db);

  if (candidates.length === 0) {
    console.log('No sample or test players found matching notes /sample|test/i.');
    process.exit(0);
  }

  // Display preview table
  const tableData = candidates.map((c) => ({
    'Player ID': c.playerId,
    'Display Name': c.displayName,
    'Note': c.notes.length > 30 ? `${c.notes.slice(0, 27)}...` : c.notes,
    'Auth UID': c.claimedByUid ? c.claimedByUid.slice(0, 10) + '...' : 'none',
    'Entries': c.entries.length,
    'Bingo': c.bingoCards.length + (c.isBingoMember ? ' (member)' : ''),
    'Claims': c.claims.length,
  }));
  console.table(tableData);

  console.log(`\nFound ${candidates.length} matching sample/test player account(s).`);

  if (!isConfirm) {
    console.log('\n[DRY RUN] No changes were made to the database.');
    console.log('To execute this deletion, re-run with:');
    console.log('  npm run admin:delete-sample-players -- --confirm\n');
    process.exit(0);
  }

  console.log('\nDeleting matched accounts and cascading data...');
  const summary = await executeDeleteSamplePlayers(db, auth, candidates);

  console.log('\n=== Deletion Complete ===');
  console.log(`Players deleted:      ${summary.deletedPlayers}`);
  console.log(`Entries deleted:      ${summary.deletedEntries}`);
  console.log(`Bingo cards deleted:  ${summary.deletedBingoCards}`);
  console.log(`Bingo members wiped:  ${summary.deletedBingoMembers}`);
  console.log(`Claims removed:       ${summary.deletedClaims}`);
  console.log(`Auth users deleted:   ${summary.deletedAuthUsers}`);
  if (summary.recountedWeeks.length > 0) {
    console.log(
      `Weeks recounted:      ${summary.recountedWeeks.map((w) => `${w.year}/${w.weekId}`).join(', ')}`,
    );
  }
  if (summary.recomputedSeasons.length > 0) {
    console.log(`Seasons recomputed:   ${summary.recomputedSeasons.join(', ')}`);
  }
  console.log('\nAll audit entries successfully written.\n');
}

// Run CLI when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Error running delete-sample-players:', err);
    process.exit(1);
  });
}
