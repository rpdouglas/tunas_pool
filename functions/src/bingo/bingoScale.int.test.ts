/**
 * Bingo at full size (Sprint 16 hardening): 60 members with 5 cards each, paid, then a winning
 * draw approved. That one transaction rewrites 300 entries and opens the next game with 300 more,
 * well past Firestore's old 500-writes-a-transaction limit. Run with `npm run test:rules`.
 */
import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { testDb } from '../testSupport.int';
import { BOSS, CONFIG, FIRST, THU, at, seedBingo } from './bingoSupport.int';
import { addMember } from './members';
import { approveDraw, enterDraw } from './draws';

const db = testDb();
const MON = at('2026-11-09T12:00:00-05:00');

describe('a full-size game', () => {
  it('approves a winning draw over 300 cards and opens the next game with all of them', async () => {
    await seedBingo(db, { config: CONFIG });
    const cards: string[] = [];
    const batch = db.batch();
    for (let p = 0; p < 60; p++) {
      const playerId = `m${p}`;
      await db
        .doc(`players/${playerId}`)
        .set({
          displayName: `Member ${p}`,
          claimedByUid: null,
          origin: 'admin',
          active: true,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      await addMember(db, { ...BOSS, playerId, ageConfirmed: true, now: THU });
      for (let c = 0; c < 5; c++) {
        const cardId = `${playerId}c${c}`;
        cards.push(cardId);
        // Seeded directly: 300 createCard transactions would only slow the test down.
        const numbers =
          c === 0 && p === 0
            ? [1, 2, 3, 4, 5, 6]
            : [10 + c, 20 + (p % 9), 30 + c, 40, 41, 42 + (p % 7)];
        batch.set(db.doc(`bingoCards/${cardId}`), {
          playerId,
          numbers,
          active: true,
          createdAt: Timestamp.now(),
          createdBy: 'boss',
          source: 'paper',
        });
        batch.set(db.doc(`bingoCycles/${FIRST}/entries/${cardId}`), {
          playerId,
          joinedDraw: FIRST,
          paidDraws: [FIRST],
          hits: [],
          count: 0,
        });
        batch.set(db.doc(`bingoCycles/${FIRST}/draws/${FIRST}/payments/${cardId}`), {
          playerId,
          paid: true,
          method: 'cash',
          receivedAt: Timestamp.fromDate(MON),
          confirmedAt: Timestamp.fromDate(MON),
          confirmedBy: 'boss',
          late: false,
          reason: null,
          intent: null,
        });
      }
    }
    await batch.commit();
    expect(cards).toHaveLength(300);

    await enterDraw(db, {
      ...BOSS,
      numbers: [1, 2, 3, 4, 5, 6],
      now: at('2026-11-11T23:00:00-05:00'),
    });
    const started = Date.now();
    const r = await approveDraw(db, {
      ...BOSS,
      drawDate: FIRST,
      now: at('2026-11-11T23:05:00-05:00'),
    });
    const ms = Date.now() - started;

    expect(r).toMatchObject({ kind: 'won', nextCycleId: '2026-11-18' });
    expect((await db.doc(`bingoCycles/${FIRST}`).get()).get('potCents')).toBe(300 * 600);
    expect((await db.collection('bingoCycles/2026-11-18/entries').count().get()).data().count).toBe(
      300,
    );
    console.log(`approve over 300 cards: ${ms} ms`);
  });
});
