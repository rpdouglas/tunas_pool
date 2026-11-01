/**
 * Reopen picks (D-145) against the Firestore emulator. Run with `npm run test:rules`.
 */
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { upsertEntry } from './adminEntries';
import { lockDueWeeks } from './lockWeeks';
import { reopenWeek } from './weekReopen';
import {
  WEEK,
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
const HOUR = 3_600_000;
const REASON = 'Locked too early; games start at 1:30';

describe('reopenWeek', () => {
  beforeEach(async () => {
    await clearDb();
    // Locked an hour ago; the first kickoff is 11 hours away (seedWeek puts kickoffs lock + 12h).
    await seedWeek(db, { status: 'locked', lockInHours: -1 });
    await seedEntry(db, 'dale');
  });

  it('opens the week with the new lock, hides the picks, and writes the audit log', async () => {
    const lockAtMs = Date.now() + 3 * HOUR;
    await expect(
      reopenWeek(db, { year: YEAR, weekId: WEEK, lockAtMs, reason: REASON, actorUid: ADMIN }),
    ).resolves.toEqual({ status: 'open', lockAtMs });

    const week = (await db.doc(weekPath()).get()).data()!;
    expect(week.status).toBe('open');
    expect(week.revealed).toBe(false);
    expect((week.lockAt as Timestamp).toMillis()).toBe(lockAtMs);

    const log = (await db.collection('auditLog').get()).docs.map((d) => d.data());
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      action: 'week.reopen',
      actorUid: ADMIN,
      reason: REASON,
      target: weekPath(),
      before: { status: 'locked', revealed: true },
      after: { status: 'open', revealed: false },
    });

    // Entries can be made again until the new lock, and the scheduled lock locks it then.
    await upsertEntry(db, {
      year: YEAR,
      weekId: WEEK,
      playerId: 'dale',
      entry: { source: 'paper', picks: picksWithWins(10), tiebreakerTotal: 38 },
      late: false,
      actorUid: ADMIN,
      nowMs: Date.now(),
    });
    expect(await lockDueWeeks(db, Date.now())).toEqual([]);
    expect(await lockDueWeeks(db, lockAtMs)).toEqual([`${YEAR}/${WEEK}`]);
    const relocked = (await db.doc(weekPath()).get()).data()!;
    expect(relocked).toMatchObject({ status: 'locked', revealed: true });
  });

  it('needs a reason, and a lock time that is ahead and before the first kickoff', async () => {
    const base = { year: YEAR, weekId: WEEK, actorUid: ADMIN };
    await expect(
      reopenWeek(db, { ...base, lockAtMs: Date.now() + HOUR, reason: '' }),
    ).rejects.toThrow(/reason/);
    await expect(
      reopenWeek(db, { ...base, lockAtMs: Date.now() - HOUR, reason: REASON }),
    ).rejects.toThrow(/already passed/);
    await expect(
      reopenWeek(db, { ...base, lockAtMs: Date.now() + 20 * HOUR, reason: REASON }),
    ).rejects.toThrow(/first game/);
    expect((await db.doc(weekPath()).get()).data()!.status).toBe('locked');
    expect((await db.collection('auditLog').get()).size).toBe(0);
  });

  it('refuses once a result is in, and in an archived season', async () => {
    const args = {
      year: YEAR,
      weekId: WEEK,
      lockAtMs: Date.now() + HOUR,
      reason: REASON,
      actorUid: ADMIN,
    };
    await db.doc(weekPath()).update({ results: { g01: 'home' } });
    await expect(reopenWeek(db, args)).rejects.toThrow(/Results are already in/);

    await db.doc(weekPath()).update({ results: {} });
    await db.doc(`seasons/${YEAR}`).set({ year: YEAR, status: 'archived' });
    await expect(reopenWeek(db, args)).rejects.toThrow(/archived/);
  });
});
