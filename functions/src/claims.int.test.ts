/**
 * Claims and merges against the Firestore emulator (Sprint 5), including the abuse cases: asking
 * about someone else reveals nothing. Run with `npm run test:rules` (it starts the emulator).
 */
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { upsertEntry } from './adminEntries';
import {
  approveClaim,
  listClaims,
  mergePlayers,
  rejectClaim,
  requestClaim,
  unlinkClaim,
} from './claims';
import { enterResults, publishWinner } from './weekActions';
import {
  ALL_HOME,
  YEAR,
  clearDb,
  picksWithWins,
  seedEntry,
  seedWeek,
  testDb,
  weekPath,
} from './testSupport.int';

const db = testDb();
const ADMIN = 'boss';
const NOW = Date.now();

async function seedPlayer(playerId: string, overrides: Record<string, unknown> = {}) {
  await db.doc(`players/${playerId}`).set({
    displayName: 'Rosalie M.',
    phone: '+16135550144',
    email: null,
    claimedByUid: null,
    origin: 'admin',
    usualPayment: 'cash',
    active: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  });
}

/** A paper entry for a roster player, in an open week. */
async function paperEntry(playerId: string, weekId: string, wins = 9) {
  await upsertEntry(db, {
    year: YEAR,
    weekId,
    playerId,
    actorUid: ADMIN,
    late: false,
    nowMs: Date.now(),
    entry: { source: 'paper', picks: picksWithWins(wins), tiebreakerTotal: 41, markPaid: 'cash' },
  });
}

const ask = (uid: string, data: unknown, extra: Record<string, unknown> = {}) =>
  requestClaim(db, {
    uid,
    email: `${uid}@example.com`,
    isGuest: false,
    data,
    nowMs: NOW,
    ...extra,
  });

const claims = async () => (await db.collection('claims').get()).docs;
const audit = async () =>
  (await db.collection('auditLog').orderBy('at').get()).docs.map((d) => d.data());
const entryIds = async (weekId: string) =>
  (await db.collection(`${weekPath(weekId)}/entries`).get()).docs.map((d) => d.id).sort();

beforeEach(async () => {
  await clearDb();
});

describe('requestClaim', () => {
  it('answers the same whether or not anyone matches, and stores only what was typed', async () => {
    await seedPlayer('rosalie');
    const hit = await ask('snoop', { claimedName: 'Rosalie M.', claimedPhone: '613-555-0144' });
    const miss = await ask('other', { claimedName: 'Nobody Atall', claimedPhone: null });
    expect(hit).toEqual({ status: 'pending' });
    expect(miss).toEqual(hit);

    const [a, b] = (await claims()).sort((x, y) =>
      x.get('requesterUid').localeCompare(y.get('requesterUid')),
    );
    for (const doc of [a, b]) {
      expect(Object.keys(doc.data()).sort()).toEqual([
        'claimedName',
        'claimedPhone',
        'createdAt',
        'requesterEmail',
        'requesterUid',
        'resolvedPlayerId',
        'status',
        'suggestedPlayerId',
      ]);
      expect(doc.get('suggestedPlayerId')).toBeNull();
      expect(doc.get('resolvedPlayerId')).toBeNull();
      expect(doc.get('status')).toBe('pending');
    }
    expect(b.data()).toMatchObject({
      requesterUid: 'snoop',
      requesterEmail: 'snoop@example.com',
      claimedName: 'Rosalie M.',
      claimedPhone: '+16135550144',
    });
    // Nothing about the roster profile changed, and nothing was logged.
    expect((await db.doc('players/rosalie').get()).get('claimedByUid')).toBeNull();
    expect(await audit()).toEqual([]);
  });

  it('needs a saved account, not a guest login', async () => {
    await expect(ask('guest', { claimedName: 'Rosalie M.' }, { isGuest: true })).rejects.toThrow(
      /Save your account/,
    );
    expect(await claims()).toHaveLength(0);
  });

  it('allows one waiting request at a time', async () => {
    await ask('kid', { claimedName: 'Rosalie M.' });
    await expect(ask('kid', { claimedName: 'Bernie T.' })).rejects.toThrow(
      /already have a request/,
    );
    expect(await claims()).toHaveLength(1);
  });

  it('stops the fourth request in a day, so names cannot be tried one after another', async () => {
    for (const name of ['Rosalie M.', 'Bernie T.', 'Hank O.']) {
      await ask('kid', { claimedName: name });
      const [open] = (await claims()).filter((c) => c.get('status') === 'pending');
      await rejectClaim(db, { claimId: open.id, note: null, actorUid: ADMIN });
    }
    await expect(ask('kid', { claimedName: 'Dale D.' })).rejects.toThrow(/Try again tomorrow/);
    expect(await claims()).toHaveLength(3);
    // A day later they may ask again.
    await expect(
      ask('kid', { claimedName: 'Dale D.' }, { nowMs: NOW + 25 * 3_600_000 }),
    ).resolves.toEqual({ status: 'pending' });
  });

  it('refuses a login that is already linked, and a request with no name', async () => {
    await seedPlayer('rosalie', { claimedByUid: 'kid' });
    await expect(ask('kid', { claimedName: 'Bernie T.' })).rejects.toThrow(/already linked/);
    await expect(ask('other', { claimedName: '' })).rejects.toThrow(/name the pool knows/);
    await expect(ask('other', { claimedName: 'Rosalie M.', claimedPhone: '12' })).rejects.toThrow(
      /phone number/,
    );
  });
});

describe('adminListClaims', () => {
  it('shows who is asking and the likely matches, best first, with weeks played', async () => {
    await seedWeek(db, { status: 'open', lockInHours: 24, weekId: 'wk01' });
    await seedWeek(db, { status: 'open', lockInHours: 24, weekId: 'wk02' });
    await seedPlayer('rosalie');
    await seedPlayer('rose', { displayName: 'Rosalie M', phone: null });
    await seedPlayer('bernie', { displayName: 'Bernie T.', phone: null });
    await paperEntry('rosalie', 'wk01');
    await paperEntry('rosalie', 'wk02');
    await ask('kid', { claimedName: 'Rosalie M.', claimedPhone: '613-555-0144' });

    const { claims: rows } = await listClaims(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      claimedName: 'Rosalie M.',
      claimedPhone: '+16135550144',
      requesterEmail: 'kid@example.com',
      requesterProfile: null,
      suggestedPlayerId: 'rosalie',
      sharedSuggestion: false,
    });
    expect(rows[0].candidates.map((c) => [c.playerId, c.weeksPlayed, c.linked])).toEqual([
      ['rosalie', 2, false],
      ['rose', 0, false],
    ]);
    expect(rows[0].candidates[0].reasons).toEqual(['phone', 'name']);
  });

  it('flags a second request for a profile that is already linked, and two requests for one profile', async () => {
    await seedPlayer('rosalie', { claimedByUid: 'grandkid' });
    await seedPlayer('bernie', { displayName: 'Bernie T.', phone: null });
    await ask('snoop', { claimedName: 'Rosalie M.', claimedPhone: '613-555-0144' });
    await ask('one', { claimedName: 'Bernie T.' });
    await ask('two', { claimedName: 'Bernie T' }, { nowMs: NOW + 1000 });

    const { claims: rows } = await listClaims(db);
    const forRosalie = rows.find((r) => r.claimedName === 'Rosalie M.')!;
    expect(forRosalie.candidates[0]).toMatchObject({ playerId: 'rosalie', linked: true });
    expect(forRosalie.suggestedPlayerId).toBeNull(); // flagged, not offered for approval

    const forBernie = rows.filter((r) => r.claimedName.startsWith('Bernie'));
    expect(forBernie.map((r) => [r.suggestedPlayerId, r.sharedSuggestion])).toEqual([
      ['bernie', true],
      ['bernie', true],
    ]);
  });

  it("offers roster profiles only, and never the claimant's own website profile", async () => {
    await seedWeek(db, { status: 'open', lockInHours: 24, weekId: 'wk01' });
    await seedEntry(db, 'kid', { name: 'Rosalie M.', weekId: 'wk01' }); // their own, claimedByUid kid
    await seedEntry(db, 'stranger', { name: 'Rosalie M.', weekId: 'wk01' }); // someone else's website profile
    await seedPlayer('rosalie');
    await ask('kid', { claimedName: 'Rosalie M.' });

    const [row] = (await listClaims(db)).claims;
    expect(row.candidates.map((c) => c.playerId)).toEqual(['rosalie']);
    expect(row.requesterProfile).toEqual({
      playerId: 'kid',
      displayName: 'Rosalie M.',
      weeksPlayed: 1,
    });
  });
});

describe('adminApproveClaim', () => {
  it('links a roster profile with three weeks of paper history, which the claimant then owns', async () => {
    for (const weekId of ['wk01', 'wk02', 'wk03']) {
      await seedWeek(db, { status: 'open', lockInHours: 24, weekId });
      await seedPlayer('rosalie');
      await paperEntry('rosalie', weekId);
    }
    await ask('kid', { claimedName: 'Rosalie M.', claimedPhone: '613-555-0144' });
    const [claim] = await claims();
    const before = (await audit()).length;

    const result = await approveClaim(db, {
      claimId: claim.id,
      playerId: 'rosalie',
      actorUid: ADMIN,
    });
    expect(result).toEqual({
      playerId: 'rosalie',
      displayName: 'Rosalie M.',
      merged: false,
      movedWeeks: [],
    });
    expect((await db.doc('players/rosalie').get()).get('claimedByUid')).toBe('kid');
    expect((await db.doc(claim.ref.path).get()).data()).toMatchObject({
      status: 'approved',
      resolvedPlayerId: 'rosalie',
      decidedBy: ADMIN,
    });
    // The history did not move: it was always under the roster profile.
    for (const weekId of ['wk01', 'wk02', 'wk03'])
      expect(await entryIds(weekId)).toEqual(['rosalie']);

    const log = (await audit()).slice(before);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      action: 'claim.approved',
      actorUid: ADMIN,
      before: { claimedByUid: null },
      after: { claimedByUid: 'kid', requesterEmail: 'kid@example.com' },
    });
    expect((await listClaims(db)).claims).toEqual([]);
  });

  it("merges the claimant's own website weeks into the roster profile, with picks and payments", async () => {
    await seedWeek(db, { status: 'open', lockInHours: 24, weekId: 'wk01' });
    await seedWeek(db, { status: 'open', lockInHours: 24, weekId: 'wk02' });
    await seedPlayer('bernie', { displayName: 'Bernie T.', phone: null });
    await paperEntry('bernie', 'wk01');
    await seedEntry(db, 'bern', {
      name: 'Bern',
      weekId: 'wk02',
      wins: 6,
      guess: 33,
      payment: 'paid',
    });
    await ask('bern', { claimedName: 'Bernie T.' });
    const [claim] = await claims();

    const result = await approveClaim(db, {
      claimId: claim.id,
      playerId: 'bernie',
      actorUid: ADMIN,
    });
    expect(result).toMatchObject({ merged: true, movedWeeks: [`${YEAR}/wk02`] });

    expect(await entryIds('wk01')).toEqual(['bernie']);
    expect(await entryIds('wk02')).toEqual(['bernie']);
    const moved = `${weekPath('wk02')}/entries/bernie`;
    expect((await db.doc(moved).get()).data()).toMatchObject({
      playerId: 'bernie',
      displayName: 'Bernie T.',
      enteredBy: 'self',
      source: 'web',
    });
    expect((await db.doc(`${moved}/private/picks`).get()).data()).toMatchObject({
      picks: picksWithWins(6),
      tiebreakerTotal: 33,
    });
    expect((await db.doc(`${moved}/payment/current`).get()).get('paymentStatus')).toBe('paid');
    for (const path of ['', '/private/picks', '/payment/current']) {
      expect((await db.doc(`${weekPath('wk02')}/entries/bern${path}`).get()).exists).toBe(false);
    }

    // One login, one live profile: the old one is kept only as a record of the merge.
    expect((await db.doc('players/bernie').get()).get('claimedByUid')).toBe('bern');
    expect((await db.doc('players/bern').get()).data()).toMatchObject({
      mergedInto: 'bernie',
      claimedByUid: null,
      active: false,
    });
    const mine = await db.collection('players').where('claimedByUid', '==', 'bern').get();
    expect(mine.docs.map((d) => d.id)).toEqual(['bernie']);
    expect((await audit()).map((a) => a.action)).toEqual(
      expect.arrayContaining(['claim.approved', 'player.merged']),
    );
  });

  it('refuses a merge when both profiles entered the same week, and changes nothing', async () => {
    await seedWeek(db, { status: 'open', lockInHours: 24, weekId: 'wk01' });
    await seedPlayer('bernie', { displayName: 'Bernie T.', phone: null });
    await paperEntry('bernie', 'wk01');
    await seedEntry(db, 'bern', { name: 'Bern', weekId: 'wk01' });
    await ask('bern', { claimedName: 'Bernie T.' });
    const [claim] = await claims();

    await expect(
      approveClaim(db, { claimId: claim.id, playerId: 'bernie', actorUid: ADMIN }),
    ).rejects.toThrow(/Both profiles have an entry in week 1 of 2026/);
    expect(await entryIds('wk01')).toEqual(['bern', 'bernie']);
    expect((await db.doc('players/bernie').get()).get('claimedByUid')).toBeNull();
    expect((await db.doc(claim.ref.path).get()).get('status')).toBe('pending');
  });

  it('will not link a profile that is already linked, a website profile, or a decided request', async () => {
    await seedPlayer('rosalie', { claimedByUid: 'grandkid' });
    await seedPlayer('free', { displayName: 'Rosalie Mae', phone: null });
    await seedWeek(db, { status: 'open', lockInHours: 24, weekId: 'wk01' });
    await seedEntry(db, 'stranger', { name: 'Rosalie M.', weekId: 'wk01' });
    await ask('snoop', { claimedName: 'Rosalie M.', claimedPhone: '613-555-0144' });
    const [claim] = await claims();
    const approve = (playerId: string) =>
      approveClaim(db, { claimId: claim.id, playerId, actorUid: ADMIN });

    await expect(approve('rosalie')).rejects.toThrow(/already linked to a login/);
    await expect(approve('stranger')).rejects.toThrow(/made by a player on the website/);
    await expect(approve('nobody')).rejects.toThrow(/isn't on the roster/);
    expect((await db.doc('players/rosalie').get()).get('claimedByUid')).toBe('grandkid');

    await rejectClaim(db, { claimId: claim.id, note: null, actorUid: ADMIN });
    await expect(approve('free')).rejects.toThrow(/already decided/);
    await expect(
      approveClaim(db, { claimId: 'missing', playerId: 'free', actorUid: ADMIN }),
    ).rejects.toThrow(/no longer exists/);
  });
});

describe('adminRejectClaim', () => {
  it('rejects with an optional note, logs it, and lets the player ask again', async () => {
    await seedPlayer('rosalie');
    await ask('kid', { claimedName: 'Rosalie M.' });
    const [claim] = await claims();

    await expect(
      rejectClaim(db, { claimId: claim.id, note: 'x'.repeat(201), actorUid: ADMIN }),
    ).rejects.toThrow(/under 200/);
    expect(
      await rejectClaim(db, { claimId: claim.id, note: ' Stop by the shop ', actorUid: ADMIN }),
    ).toEqual({ status: 'rejected' });
    expect((await db.doc(claim.ref.path).get()).data()).toMatchObject({
      status: 'rejected',
      decisionNote: 'Stop by the shop',
      decidedBy: ADMIN,
      resolvedPlayerId: null,
    });
    expect((await db.doc('players/rosalie').get()).get('claimedByUid')).toBeNull();
    expect((await audit()).map((a) => a.action)).toEqual(['claim.rejected']);
    await expect(
      rejectClaim(db, { claimId: claim.id, note: null, actorUid: ADMIN }),
    ).rejects.toThrow(/already decided/);
    await expect(ask('kid', { claimedName: 'Rosalie M.' })).resolves.toEqual({ status: 'pending' });
  });
});

describe('adminUnlinkClaim', () => {
  it('restores the state before the approval, and logs it', async () => {
    await seedWeek(db, { status: 'open', lockInHours: 24, weekId: 'wk01' });
    await seedPlayer('rosalie');
    await paperEntry('rosalie', 'wk01');
    const profileBefore = (await db.doc('players/rosalie').get()).data()!;
    await ask('kid', { claimedName: 'Rosalie M.' });
    const [claim] = await claims();
    await approveClaim(db, { claimId: claim.id, playerId: 'rosalie', actorUid: ADMIN });

    expect(await unlinkClaim(db, { playerId: 'rosalie', actorUid: ADMIN })).toEqual({
      unlinked: true,
    });
    const profileAfter = (await db.doc('players/rosalie').get()).data()!;
    expect({ ...profileAfter, updatedAt: null }).toEqual({ ...profileBefore, updatedAt: null });
    expect(await entryIds('wk01')).toEqual(['rosalie']);
    expect((await db.doc(claim.ref.path).get()).data()).toMatchObject({
      status: 'rejected',
      resolvedPlayerId: null,
    });
    const log = await audit();
    expect(log[log.length - 1]).toMatchObject({
      action: 'claim.unlinked',
      before: { claimedByUid: 'kid' },
      after: { claimedByUid: null },
    });
    // It can be claimed again, by the right person this time.
    await ask('daughter', { claimedName: 'Rosalie M.' });
    expect((await listClaims(db)).claims[0].suggestedPlayerId).toBe('rosalie');
  });

  it('refuses a player with no login, a website profile, and an unknown player', async () => {
    await seedPlayer('rosalie');
    await seedWeek(db, { status: 'open', lockInHours: 24, weekId: 'wk01' });
    await seedEntry(db, 'dale', { weekId: 'wk01' });
    const unlink = (playerId: string) => unlinkClaim(db, { playerId, actorUid: ADMIN });
    await expect(unlink('rosalie')).rejects.toThrow(/isn't linked/);
    await expect(unlink('dale')).rejects.toThrow(/made by the player on the website/);
    await expect(unlink('nobody')).rejects.toThrow(/isn't on the roster/);
  });
});

describe('adminMergePlayers', () => {
  it('moves every entry, keeps a login with the entries, and retires the old profile', async () => {
    await seedWeek(db, { status: 'open', lockInHours: 24, weekId: 'wk01' });
    await seedWeek(db, { status: 'open', lockInHours: 24, weekId: 'wk02' });
    await seedEntry(db, 'guest1', { name: 'Bob Smith', weekId: 'wk01', wins: 7, payment: 'paid' });
    await seedEntry(db, 'guest2', { name: 'Robert Smith', weekId: 'wk02', wins: 5, payment: null });
    await db.doc('players/guest2').update({ claimedByUid: null }); // only the old profile has a login

    const result = await mergePlayers(db, { fromId: 'guest1', intoId: 'guest2', actorUid: ADMIN });
    expect(result).toEqual({ intoId: 'guest2', movedWeeks: [`${YEAR}/wk01`] });
    expect(await entryIds('wk01')).toEqual(['guest2']);
    expect(await entryIds('wk02')).toEqual(['guest2']);
    expect((await db.doc(`${weekPath('wk01')}/entries/guest2`).get()).get('displayName')).toBe(
      'Robert Smith',
    );
    expect(
      (await db.doc(`${weekPath('wk01')}/entries/guest2/payment/current`).get()).get(
        'paymentStatus',
      ),
    ).toBe('paid');
    expect((await db.doc('players/guest2').get()).get('claimedByUid')).toBe('guest1');
    expect((await db.doc('players/guest1').get()).data()).toMatchObject({
      mergedInto: 'guest2',
      claimedByUid: null,
      active: false,
    });
    const log = await audit();
    expect(log[log.length - 1]).toMatchObject({
      action: 'player.merged',
      actorUid: ADMIN,
      after: { mergedInto: 'guest2', movedWeeks: [`${YEAR}/wk01`], intoClaimedByUid: 'guest1' },
    });
  });

  it('keeps a published winner pointing at the right person', async () => {
    await seedWeek(db, { status: 'locked', lockInHours: -2, weekId: 'wk01' });
    await seedEntry(db, 'guest1', { name: 'Bob Smith', weekId: 'wk01', wins: 12, payment: 'paid' });
    await seedEntry(db, 'other', { name: 'Jen K.', weekId: 'wk01', wins: 3, payment: 'paid' });
    const ref = { year: YEAR, weekId: 'wk01', actorUid: ADMIN };
    await enterResults(db, { ...ref, results: ALL_HOME, mnfTotal: 44 });
    await publishWinner(db, { ...ref, expectedPlayerIds: ['guest1'] });
    await seedPlayer('bob', { displayName: 'Robert Smith', phone: null });

    await mergePlayers(db, { fromId: 'guest1', intoId: 'bob', actorUid: ADMIN });
    const winner = (await db.doc(weekPath('wk01')).get()).get('winner');
    expect(winner.playerIds).toEqual(['bob']);
    expect(winner.tiedPlayerIds).toEqual(['bob']);
    expect(winner.displayNames).toEqual(['Robert Smith']);
    expect((await db.doc(`${weekPath('wk01')}/entries/bob`).get()).get('record')).toEqual({
      wins: 12,
      losses: 3,
    });
  });

  it('refuses the same player twice, a merged or unknown profile, and a week both entered', async () => {
    await seedWeek(db, { status: 'open', lockInHours: 24, weekId: 'wk01' });
    await seedEntry(db, 'a', { name: 'Bob Smith', weekId: 'wk01' });
    await seedEntry(db, 'b', { name: 'Robert Smith', weekId: 'wk01' });
    await seedPlayer('gone', { mergedInto: 'a' });
    const merge = (fromId: string, intoId: string) =>
      mergePlayers(db, { fromId, intoId, actorUid: ADMIN });

    await expect(merge('a', 'a')).rejects.toThrow(/two different players/);
    await expect(merge('gone', 'a')).rejects.toThrow(/already merged/);
    await expect(merge('a', 'nobody')).rejects.toThrow(/isn't on the roster/);
    await expect(merge('a', 'b')).rejects.toThrow(/Both profiles have an entry in week 1/);
    expect(await entryIds('wk01')).toEqual(['a', 'b']);
    expect((await db.doc('players/a').get()).get('mergedInto')).toBeUndefined();
  });
});
