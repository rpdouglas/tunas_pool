/**
 * Roster players who aren't in bingo yet, for staff adding a paper member (D-114). Names only:
 * the counter never reads phones or emails (D-095), and the `players` collection isn't his to read.
 */
import type { Firestore } from 'firebase-admin/firestore';

export async function bingoRoster(
  db: Firestore,
): Promise<{ playerId: string; displayName: string }[]> {
  const [players, members] = await Promise.all([
    db.collection('players').select('displayName', 'active', 'mergedInto').get(),
    db.collection('bingoMembers').select().get(),
  ]);
  const inBingo = new Set(members.docs.map((d) => d.id));
  return players.docs
    .filter((d) => d.get('active') !== false && !d.get('mergedInto') && !inBingo.has(d.id))
    .map((d) => ({ playerId: d.id, displayName: (d.get('displayName') as string) ?? '' }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
