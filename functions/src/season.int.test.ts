/**
 * Season standings, all-time stats, and the season report against the Firestore emulator
 * (Sprint 7). Run with `npm run test:rules` (it starts the emulator).
 */
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { recomputeAllTime, recomputeStandings, seasonReport } from './season';
import { correctResults, enterResults, publishWinner } from './weekActions';
import { ALL_HOME, YEAR, clearDb, seedEntry, seedWeek, testDb } from './testSupport.int';

const db = testDb();
const ADMIN = 'boss';
/** Dale has saved his account; everyone else's login is a guest login. */
const savedLogins = async (uids: string[]) => new Set(uids.filter((uid) => uid === 'dale'));

async function playWeek(
  weekId: string,
  players: { id: string; name: string; wins: number; paid?: boolean }[],
  publish: string[] | null,
) {
  await seedWeek(db, { weekId });
  for (const p of players) {
    await seedEntry(db, p.id, {
      name: p.name,
      wins: p.wins,
      weekId,
      payment: p.paid === false ? 'unpaid' : 'paid',
    });
  }
  const ref = { year: YEAR, weekId, actorUid: ADMIN };
  await enterResults(db, { ...ref, results: ALL_HOME, mnfTotal: 44 });
  if (publish) await publishWinner(db, { ...ref, expectedPlayerIds: publish });
}

const standings = async () =>
  Object.fromEntries(
    (await db.collection(`seasons/${YEAR}/standings`).get()).docs.map((d) => [d.id, d.data()]),
  );

beforeEach(async () => {
  await clearDb();
  await db
    .doc(`seasons/${YEAR}`)
    .set({ year: YEAR, status: 'active', entryFeeCents: 2000, createdAt: Timestamp.now() });
});

describe('recomputeStandings', () => {
  it('adds up the final weeks for roster players and saved logins, and leaves guests weekly only', async () => {
    await playWeek(
      'wk01',
      [
        { id: 'dale', name: 'Dale D.', wins: 11 },
        { id: 'rosalie', name: 'Rosalie M.', wins: 9 },
        { id: 'guest', name: 'Guest G.', wins: 12, paid: false },
      ],
      ['dale'],
    );
    await playWeek(
      'wk02',
      [
        { id: 'dale', name: 'Dale D.', wins: 8 },
        { id: 'rosalie', name: 'Rosalie M.', wins: 10 },
      ],
      ['rosalie'],
    );
    await playWeek('wk03', [{ id: 'dale', name: 'Dale D.', wins: 15 }], null); // locked, not final
    await db.doc('players/rosalie').update({ origin: 'admin', claimedByUid: null }); // a roster player

    expect(await recomputeStandings(db, YEAR, savedLogins)).toEqual({ players: 2, removed: 0 });
    const rows = await standings();
    expect(Object.keys(rows).sort()).toEqual(['dale', 'rosalie']);
    expect(rows.dale).toMatchObject({
      displayName: 'Dale D.',
      weeksPlayed: 2,
      wins: 19,
      losses: 11,
      weeklyTitles: 1,
      weekRecords: { wk01: { wins: 11, losses: 4 }, wk02: { wins: 8, losses: 7 } },
    });
    expect(rows.rosalie).toMatchObject({ weeksPlayed: 2, wins: 19, losses: 11, weeklyTitles: 1 });
    expect(rows.dale.updatedAt).toBeTruthy();
  });

  it('follows a correction, and drops a player who is no longer eligible', async () => {
    await playWeek(
      'wk01',
      [
        { id: 'dale', name: 'Dale D.', wins: 15 },
        { id: 'jen', name: 'Jen K.', wins: 14 },
      ],
      ['dale'],
    );
    const everyoneSaved = async (uids: string[]) => new Set(uids);
    await recomputeStandings(db, YEAR, everyoneSaved);
    expect((await standings()).dale).toMatchObject({ wins: 15, weeklyTitles: 1 });

    // Monday night is corrected: Jen had the other side, so she wins the week.
    await correctResults(db, {
      year: YEAR,
      weekId: 'wk01',
      actorUid: ADMIN,
      results: { ...ALL_HOME, mnf: 'away' },
      mnfTotal: 40,
      reason: 'Entered the wrong way round',
    });
    expect(await recomputeStandings(db, YEAR, savedLogins)).toEqual({ players: 1, removed: 1 });
    const rows = await standings();
    expect(rows.dale).toMatchObject({ wins: 14, losses: 1, weeklyTitles: 0 });
    expect(rows.jen).toBeUndefined(); // her login is a guest login in this lookup
  });

  it('is empty, and clears old rows, when no week is final', async () => {
    await playWeek('wk01', [{ id: 'dale', name: 'Dale D.', wins: 9 }], null);
    await db.doc(`seasons/${YEAR}/standings/old`).set({ displayName: 'Old', wins: 1 });
    expect(await recomputeStandings(db, YEAR, savedLogins)).toEqual({ players: 0, removed: 1 });
    expect(await standings()).toEqual({});
  });
});

describe('recomputeAllTime', () => {
  it("writes each player's stats from real seasons, guests included, and skips test seasons", async () => {
    await playWeek(
      'wk01',
      [
        { id: 'dale', name: 'Dale D.', wins: 11 },
        { id: 'guest', name: 'Guest G.', wins: 6 },
      ],
      ['dale'],
    );
    await playWeek('wk02', [{ id: 'dale', name: 'Dale D.', wins: 13 }], ['dale']);
    // A test season with a final week for Dale: it must not count.
    await db.doc('seasons/2026-test').set({ year: '2026-test', status: 'active' });
    const testWeek = (await db.doc(`seasons/${YEAR}/weeks/wk02`).get()).data()!;
    await db.doc('seasons/2026-test/weeks/wk01').set(testWeek);
    await db
      .doc('seasons/2026-test/weeks/wk01/entries/dale')
      .set({ playerId: 'dale', displayName: 'Dale D.' });
    await db
      .doc('seasons/2026-test/weeks/wk01/entries/dale/private/picks')
      .set({ picks: ALL_HOME, tiebreakerTotal: 40 });

    expect(await recomputeAllTime(db)).toEqual({ players: 2 });
    expect((await db.doc('players/dale/stats/allTime').get()).data()).toMatchObject({
      weeksPlayed: 2,
      wins: 24,
      losses: 6,
      weeklyTitles: 2,
      bestWeekRecord: { wins: 13, losses: 2 },
      lastPlayedWeek: `${YEAR}/wk02`,
    });
    expect((await db.doc('players/guest/stats/allTime').get()).data()).toMatchObject({
      weeksPlayed: 1,
      wins: 6,
      losses: 9,
      weeklyTitles: 0,
    });
  });
});

describe('adminSeasonReport', () => {
  it("reports each week's entries, money, winner, and unpaid players", async () => {
    await playWeek(
      'wk01',
      [
        { id: 'dale', name: 'Dale D.', wins: 11 },
        { id: 'jen', name: 'Jen K.', wins: 9 },
        { id: 'troy', name: 'Troy T.', wins: 14, paid: false },
      ],
      ['dale'],
    );
    await playWeek('wk02', [{ id: 'dale', name: 'Dale D.', wins: 8 }], null);
    await seedWeek(db, { weekId: 'wk03', status: 'draft', lockInHours: 48 });

    const report = await seasonReport(db, YEAR);
    expect(report.weeks.map((w) => w.weekNumber)).toEqual([1, 2]); // the draft is left out
    expect(report.weeks[0]).toMatchObject({
      status: 'final',
      entries: 3,
      paid: 2,
      unpaid: 1,
      potCents: 4000,
      winners: ['Dale D.'],
      shareCents: 4000,
      payoutSent: false,
      unpaidNames: ['Troy T.'],
      newPlayers: 3,
      averageWins: 11.3,
    });
    expect(report.weeks[1]).toMatchObject({
      status: 'locked',
      entries: 1,
      potCents: 2000,
      winners: [],
      newPlayers: 0,
      returningPlayers: 1,
    });
    expect(report.totals).toEqual({ weeks: 2, entries: 4, players: 3, potCents: 6000, unpaid: 1 });
  });
});

describe('seasons: archive and reopen', () => {
  it('archives a finished season with an audit entry, stops weeks opening, and can be reopened', async () => {
    const { listSeasons, setSeasonStatus, isSeasonArchived } = await import('./seasons');
    await playWeek('wk01', [{ id: 'dale', name: 'Dale D.', wins: 11 }], ['dale']);
    await playWeek('wk02', [{ id: 'dale', name: 'Dale D.', wins: 9 }], null); // still locked

    await expect(
      setSeasonStatus(db, { year: YEAR, status: 'archived', actorUid: ADMIN }),
    ).rejects.toThrow(/1 week is still being played/);
    await publishWinner(db, {
      year: YEAR,
      weekId: 'wk02',
      actorUid: ADMIN,
      expectedPlayerIds: ['dale'],
    });

    const archived = await setSeasonStatus(db, { year: YEAR, status: 'archived', actorUid: ADMIN });
    expect(archived).toMatchObject({
      year: YEAR,
      status: 'archived',
      weeks: 2,
      finalWeeks: 2,
      liveWeeks: 0,
    });
    const season = await db.doc(`seasons/${YEAR}`).get();
    expect(season.get('status')).toBe('archived');
    expect(season.get('archivedAt')).toBeTruthy();
    expect(await isSeasonArchived(db, YEAR)).toBe(true);
    const log = (await db.collection('auditLog').where('action', '==', 'season.status').get()).docs;
    expect(log).toHaveLength(1);
    expect(log[0].data()).toMatchObject({
      actorUid: ADMIN,
      before: { status: 'active' },
      after: { status: 'archived' },
      year: YEAR,
    });

    // The roster and the history are untouched by archiving.
    expect((await db.doc('players/dale').get()).exists).toBe(true);
    expect((await db.doc(`seasons/${YEAR}/weeks/wk01/entries/dale`).get()).exists).toBe(true);

    expect(await listSeasons(db)).toEqual([
      {
        year: YEAR,
        status: 'archived',
        weeks: 2,
        finalWeeks: 2,
        liveWeeks: 0,
        draftWeeks: 0,
        test: false,
      },
    ]);
    await expect(
      setSeasonStatus(db, { year: YEAR, status: 'archived', actorUid: ADMIN }),
    ).rejects.toThrow(/already archived/);

    await setSeasonStatus(db, { year: YEAR, status: 'active', actorUid: ADMIN });
    const reopened = await db.doc(`seasons/${YEAR}`).get();
    expect(reopened.get('status')).toBe('active');
    expect(reopened.get('archivedAt')).toBeUndefined();
    await expect(
      setSeasonStatus(db, { year: '1999', status: 'archived', actorUid: ADMIN }),
    ).rejects.toThrow(/does not exist/);
  });
});
