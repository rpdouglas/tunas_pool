/**
 * Seasons (PROJECT_PLAN Sprint 10): archiving a finished season and reopening one. The roster needs
 * no rollover: players are not tied to a season (CLAUDE.md §4.1), so they, their logins, and their
 * history carry over untouched, and nobody re-registers. A new season starts when its first week is
 * set up.
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { auditInTransaction } from './audit';

export interface SeasonSummary {
  year: string;
  status: 'active' | 'archived';
  weeks: number;
  finalWeeks: number;
  /** Weeks that are open or locked: still being played. */
  liveWeeks: number;
  draftWeeks: number;
  test: boolean;
}

export type ArchivePlan = { ok: true } | { ok: false; message: string };

/** A season can be archived once nothing in it is still being played. */
export function planSeasonStatus(
  season: { status: string; liveWeeks: number },
  to: 'active' | 'archived',
): ArchivePlan {
  if (season.status === to) {
    return {
      ok: false,
      message: `This season is already ${to === 'archived' ? 'archived' : 'open'}.`,
    };
  }
  if (to === 'archived' && season.liveWeeks > 0) {
    return {
      ok: false,
      message: `${season.liveWeeks} ${season.liveWeeks === 1 ? 'week is' : 'weeks are'} still being played. Publish the winner for each, then archive the season.`,
    };
  }
  return { ok: true };
}

function summarize(year: string, status: unknown, weekStatuses: string[]): SeasonSummary {
  return {
    year,
    status: status === 'archived' ? 'archived' : 'active',
    weeks: weekStatuses.length,
    finalWeeks: weekStatuses.filter((s) => s === 'final').length,
    liveWeeks: weekStatuses.filter((s) => s === 'open' || s === 'locked').length,
    draftWeeks: weekStatuses.filter((s) => s === 'draft').length,
    test: year.endsWith('-test'),
  };
}

/** `adminListSeasons`: every season with how its weeks stand, newest first. */
export async function listSeasons(db: Firestore): Promise<SeasonSummary[]> {
  const seasons = await db.collection('seasons').get();
  const rows = await Promise.all(
    seasons.docs.map(async (season) => {
      const weeks = await season.ref.collection('weeks').select('status').get();
      return summarize(
        season.id,
        season.get('status'),
        weeks.docs.map((w) => String(w.get('status'))),
      );
    }),
  );
  return rows.sort((a, b) => b.year.localeCompare(a.year));
}

/** `adminSetSeasonStatus`: archive a finished season, or reopen one archived by mistake. */
export async function setSeasonStatus(
  db: Firestore,
  input: { year: string; status: 'active' | 'archived'; actorUid: string },
): Promise<SeasonSummary> {
  const { year, status, actorUid } = input;
  const seasonRef = db.doc(`seasons/${year}`);
  return db.runTransaction(async (tx) => {
    const [season, weeks] = await Promise.all([
      tx.get(seasonRef),
      tx.get(seasonRef.collection('weeks').select('status')),
    ]);
    if (!season.exists) throw new HttpsError('not-found', 'That season does not exist.');
    const before = summarize(
      year,
      season.get('status'),
      weeks.docs.map((w) => String(w.get('status'))),
    );
    const plan = planSeasonStatus(before, status);
    if (!plan.ok) throw new HttpsError('failed-precondition', plan.message);

    tx.update(seasonRef, {
      status,
      archivedAt: status === 'archived' ? FieldValue.serverTimestamp() : FieldValue.delete(),
    });
    auditInTransaction(tx, db, {
      actorUid,
      action: 'season.status',
      target: seasonRef.path,
      before: { status: before.status },
      after: { status },
      year,
    });
    return { ...before, status };
  });
}

/** True when the season is archived. Opening a week there is refused (index.ts). */
export async function isSeasonArchived(db: Firestore, year: string): Promise<boolean> {
  return (await db.doc(`seasons/${year}`).get()).get('status') === 'archived';
}
