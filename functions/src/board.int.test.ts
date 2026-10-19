/**
 * The weekly board's functions (D-102) against the Firestore emulator. Run with `npm run test:rules`.
 */
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { hideMessage, joinBoard, setMute } from './board';
import { YEAR, clearDb, seedWeek, testDb } from './testSupport.int';

const db = testDb();
const WEEK = 'wk01';
const ref = { year: YEAR, weekId: WEEK };
const board = `seasons/${YEAR}/weeks/${WEEK}/board`;
const DEVON = {
  actorUid: 'devon-uid',
  actorRole: 'counter' as const,
  actorEmail: 'devon@shop.test',
};

async function audits() {
  const snap = await db.collection('auditLog').get();
  return snap.docs.map((d) => d.data());
}

beforeEach(async () => {
  await clearDb();
  await seedWeek(db, { weekId: WEEK, status: 'locked' });
  await db.doc('players/p1').set({
    displayName: 'Alice A.',
    claimedByUid: 'alice',
    origin: 'self',
    active: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  await db.doc(`${board}/m1`).set({
    playerId: 'p1',
    displayName: 'Alice A.',
    text: "Your mom's picks are better",
    createdAt: Timestamp.now(),
    editedAt: null,
    hidden: false,
  });
});

describe('joinBoard', () => {
  it('points a login at its player, and clears the pointer when the login has none', async () => {
    expect(await joinBoard(db, 'alice')).toEqual({ playerId: 'p1' });
    expect((await db.doc('logins/alice').get()).get('playerId')).toBe('p1');

    await db.doc('players/p1').update({ claimedByUid: null });
    expect(await joinBoard(db, 'alice')).toEqual({ playerId: null });
    expect((await db.doc('logins/alice').get()).exists).toBe(false);
  });

  it('ignores a profile that was merged into another one', async () => {
    await db.doc('players/p1').update({ mergedInto: 'p9' });
    expect(await joinBoard(db, 'alice')).toEqual({ playerId: null });
  });
});

describe('hideMessage', () => {
  it('removes the text from the board, keeps it in the audit log with the reason and who did it', async () => {
    await hideMessage(db, {
      ...ref,
      ...DEVON,
      messageId: 'm1',
      reason: "House rules: nobody's mom",
    });
    const message = (await db.doc(`${board}/m1`).get()).data()!;
    expect(message).toMatchObject({ hidden: true, text: '', hiddenBy: 'devon-uid' });
    const [log] = await audits();
    expect(log).toMatchObject({
      action: 'board.hidden',
      actorRole: 'counter',
      actorEmail: 'devon@shop.test',
      reason: "House rules: nobody's mom",
      before: { text: "Your mom's picks are better", displayName: 'Alice A.' },
    });
  });

  it('needs a reason, and hiding twice changes nothing', async () => {
    await expect(
      hideMessage(db, { ...ref, actorUid: 'boss', messageId: 'm1', reason: '' }),
    ).rejects.toThrow(/reason/);
    await hideMessage(db, { ...ref, actorUid: 'boss', messageId: 'm1', reason: 'Over the line' });
    await hideMessage(db, { ...ref, actorUid: 'boss', messageId: 'm1', reason: 'Over the line' });
    expect(await audits()).toHaveLength(1);
  });

  it('says so when the post is gone', async () => {
    await expect(
      hideMessage(db, { ...ref, actorUid: 'boss', messageId: 'nope', reason: 'Over the line' }),
    ).rejects.toThrow(/gone/);
  });
});

describe('setMute', () => {
  it('mutes and unmutes for the week, each with a reason in the audit log', async () => {
    await setMute(db, { ...ref, actorUid: 'boss', playerId: 'p1', muted: true, reason: 'Threats' });
    expect((await db.doc(`seasons/${YEAR}/weeks/${WEEK}/boardMutes/p1`).get()).get('reason')).toBe(
      'Threats',
    );
    await setMute(db, {
      ...ref,
      actorUid: 'boss',
      playerId: 'p1',
      muted: false,
      reason: 'Apologized',
    });
    expect((await db.doc(`seasons/${YEAR}/weeks/${WEEK}/boardMutes/p1`).get()).exists).toBe(false);
    const logs = await audits();
    expect(logs.map((l) => [l.action, l.after.muted, l.reason])).toEqual(
      expect.arrayContaining([
        ['board.mute', true, 'Threats'],
        ['board.mute', false, 'Apologized'],
      ]),
    );
  });

  it('refuses an unknown player and does nothing when already in that state', async () => {
    await expect(
      setMute(db, { ...ref, actorUid: 'boss', playerId: 'ghost', muted: true, reason: 'Threats' }),
    ).rejects.toThrow(/roster/);
    await setMute(db, {
      ...ref,
      actorUid: 'boss',
      playerId: 'p1',
      muted: false,
      reason: 'Nothing to lift',
    });
    expect(await audits()).toHaveLength(0);
  });
});
