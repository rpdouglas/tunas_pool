/**
 * Integration tests for scripts/delete-sample-players.ts against the Firestore emulator.
 * Run with `npm run test:rules`.
 */
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  executeDeleteSamplePlayers,
  findSamplePlayers,
} from '../../scripts/delete-sample-players';
import { clearDb, seedWeek, testDb, YEAR } from './testSupport.int';

const db = testDb();

async function seedPlayer(
  playerId: string,
  data: {
    displayName: string;
    notes?: string | null;
    claimedByUid?: string | null;
  },
) {
  await db.doc(`players/${playerId}`).set({
    displayName: data.displayName,
    notes: data.notes ?? null,
    claimedByUid: data.claimedByUid ?? null,
    origin: 'admin',
    active: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

const exists = async (path: string) => (await db.doc(path).get()).exists;

describe('delete-sample-players script', () => {
  beforeEach(clearDb);

  it('matches only players whose notes contain sample or test', async () => {
    await seedPlayer('p1', { displayName: 'Real Dale', notes: 'Prefers paper' });
    await seedPlayer('p2', { displayName: 'Real Rosalie', notes: null });
    await seedPlayer('p3', { displayName: 'Sample Bob', notes: 'This is a sample account' });
    await seedPlayer('p4', { displayName: 'Test Alice', notes: 'test player for season 2026' });

    const candidates = await findSamplePlayers(db);
    expect(candidates.map((c) => c.playerId).sort()).toEqual(['p3', 'p4']);
  });

  it('gathers associated entries, bingo cards, and claims for candidate accounts', async () => {
    await seedWeek(db, { weekId: 'wk01', status: 'open' });
    await seedPlayer('sample1', { displayName: 'Sample User', notes: 'sample account' });

    // Seed weekly entry and private picks
    await db.doc(`seasons/${YEAR}/weeks/wk01/entries/sample1`).set({
      enteredAt: Timestamp.now(),
      tiebreaker: 42,
    });
    await db.doc(`seasons/${YEAR}/weeks/wk01/entries/sample1/private/picks`).set({
      picks: { mnf: 'home' },
    });

    // Seed bingo card
    await db.doc('bingoCards/card_sample_1').set({
      playerId: 'sample1',
      numbers: [1, 2, 3, 4, 5, 6],
    });

    // Seed bingo membership
    await db.doc('bingoMembers/sample1').set({
      joinedAt: Timestamp.now(),
    });

    // Seed claim
    await db.doc('claims/claim_sample_1').set({
      suggestedPlayerId: 'sample1',
      status: 'pending',
    });

    const candidates = await findSamplePlayers(db);
    expect(candidates).toHaveLength(1);
    const candidate = candidates[0];
    expect(candidate.playerId).toBe('sample1');
    expect(candidate.entries).toHaveLength(1);
    expect(candidate.bingoCards).toEqual(['card_sample_1']);
    expect(candidate.isBingoMember).toBe(true);
    expect(candidate.claims).toEqual(['claim_sample_1']);
  });

  it('cascade deletes matched players and their associated data while leaving normal players untouched', async () => {
    await seedWeek(db, { weekId: 'wk01', status: 'open' });

    // Real player
    await seedPlayer('real1', { displayName: 'Dale G.', notes: 'Real customer' });
    await db.doc(`seasons/${YEAR}/weeks/wk01/entries/real1`).set({
      enteredAt: Timestamp.now(),
      tiebreaker: 35,
    });
    await db.doc(`seasons/${YEAR}/weeks/wk01/entries/real1/payment/payment`).set({
      paymentStatus: 'paid',
      amountCents: 2000,
    });

    // Sample player
    await seedPlayer('sample1', { displayName: 'Test Dummy', notes: 'sample test user' });
    await db.doc(`players/sample1/stats/allTime`).set({ wins: 0, weeksPlayed: 1 });
    await db.doc(`seasons/${YEAR}/weeks/wk01/entries/sample1`).set({
      enteredAt: Timestamp.now(),
      tiebreaker: 40,
    });
    await db.doc(`seasons/${YEAR}/weeks/wk01/entries/sample1/private/picks`).set({
      picks: { mnf: 'away' },
    });
    await db.doc('bingoCards/card_test_1').set({ playerId: 'sample1' });
    await db.doc('bingoMembers/sample1').set({ active: true });
    await db.doc('claims/claim_test_1').set({ suggestedPlayerId: 'sample1' });

    const candidates = await findSamplePlayers(db);
    expect(candidates).toHaveLength(1);

    const summary = await executeDeleteSamplePlayers(db, null, candidates);

    expect(summary.deletedPlayers).toBe(1);
    expect(summary.deletedEntries).toBe(1);
    expect(summary.deletedBingoCards).toBe(1);
    expect(summary.deletedBingoMembers).toBe(1);
    expect(summary.deletedClaims).toBe(1);

    // Verify sample documents are gone
    expect(await exists('players/sample1')).toBe(false);
    expect(await exists('players/sample1/stats/allTime')).toBe(false);
    expect(await exists(`seasons/${YEAR}/weeks/wk01/entries/sample1`)).toBe(false);
    expect(await exists(`seasons/${YEAR}/weeks/wk01/entries/sample1/private/picks`)).toBe(false);
    expect(await exists('bingoCards/card_test_1')).toBe(false);
    expect(await exists('bingoMembers/sample1')).toBe(false);
    expect(await exists('claims/claim_test_1')).toBe(false);

    // Verify real player documents remain intact
    expect(await exists('players/real1')).toBe(true);
    expect(await exists(`seasons/${YEAR}/weeks/wk01/entries/real1`)).toBe(true);
    expect(await exists(`seasons/${YEAR}/weeks/wk01/entries/real1/payment/payment`)).toBe(true);

    // Verify audit log entry
    const auditDocs = await db.collection('auditLog').where('action', '==', 'player.delete').get();
    expect(auditDocs.size).toBe(1);
    const auditData = auditDocs.docs[0].data();
    expect(auditData.target).toBe('players/sample1');
    expect(auditData.reason).toBe('Maintenance cleanup of sample/test account');
    expect(auditData.before.displayName).toBe('Test Dummy');
  });
});
