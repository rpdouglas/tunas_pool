/**
 * Season standings, all-time stats, and the commissioner's season report (PROJECT_PLAN Sprint 7).
 * Everything is worked out again from the final weeks' own entries each time, never added to, so a
 * correction, a merge, or a retried call cannot leave the numbers off (the same idea as D-048).
 * Clients never write any of it (CLAUDE.md §4.6).
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { buildSeasonReport, type ReportWeekInput, type SeasonReport } from '../../shared/reports';
import { scorePicks } from '../../shared/scoring';
import {
  buildAllTime,
  buildStandings,
  type SeasonWeek,
  type StandingsPlayer,
} from '../../shared/standings';
import type { Game, GameResult, Pick as PickSide } from '../../shared/types';
import { loadPoolRules } from './evaluate';

/** Test seasons (D-044) get their own standings but never count toward all-time stats. */
const isTestSeason = (year: string) => year.endsWith('-test');

/** Every week of a season that players can see, with each entry's picks, record, and payment. */
interface StoredWinner {
  playerIds?: string[];
  displayNames?: string[];
  potCents?: number;
  shareCents?: number;
}

/** A week as the report needs it, plus who won, for the standings. */
type LoadedWeek = ReportWeekInput & { winnerIds: string[] };

async function loadSeason(db: Firestore, year: string): Promise<LoadedWeek[]> {
  const { tieRule } = await loadPoolRules(db);
  const weeks = await db.collection(`seasons/${year}/weeks`).get();
  return Promise.all(
    weeks.docs
      .filter((week) => week.get('status') !== 'draft')
      .map(async (week): Promise<LoadedWeek> => {
        const games = ((week.get('games') ?? []) as Game[]).map((g) => ({
          id: g.id,
          away: g.away,
          home: g.home,
        }));
        const gameIds = games.map((g) => g.id);
        const results = (week.get('results') ?? {}) as Record<string, GameResult>;
        const entries = await week.ref.collection('entries').get();
        const [payments, picks] = entries.empty
          ? [[], []]
          : await Promise.all([
              db.getAll(...entries.docs.map((e) => e.ref.collection('payment').doc('current')), {
                fieldMask: ['paymentStatus'],
              }),
              db.getAll(...entries.docs.map((e) => e.ref.collection('private').doc('picks'))),
            ]);
        const winner = week.get('winner') as StoredWinner | null;
        return {
          weekId: week.id,
          weekNumber: Number(week.get('weekNumber')),
          status: String(week.get('status')),
          entryFeeCents: Number(week.get('entryFeeCents') ?? 2000),
          games,
          results,
          winner: winner
            ? {
                displayNames: winner.displayNames ?? [],
                potCents: winner.potCents ?? 0,
                shareCents: winner.shareCents ?? 0,
              }
            : null,
          winnerIds: winner?.playerIds ?? [],
          payoutSent: week.get('payoutSent') === true,
          entries: entries.docs.map((entry, i) => {
            const pickMap = (picks[i].get('picks') ?? {}) as Record<string, PickSide>;
            return {
              playerId: entry.id,
              displayName: String(entry.get('displayName') ?? ''),
              paid: payments[i].exists && payments[i].get('paymentStatus') === 'paid',
              picks: pickMap,
              wins: scorePicks(pickMap, results, gameIds, tieRule).wins,
            };
          }),
        };
      }),
  );
}

function toSeasonWeeks(weeks: LoadedWeek[]): SeasonWeek[] {
  return weeks.map((week) => {
    const decided = week.games.filter((g) => week.results[g.id]).length;
    return {
      weekId: week.weekId,
      weekNumber: week.weekNumber,
      status: week.status,
      winnerIds: week.winnerIds,
      // Every decided game is a win or a loss for every entry (D-046), so losses follow from wins.
      records: week.entries.map((e) => ({
        playerId: e.playerId,
        wins: e.wins,
        losses: decided - e.wins,
      })),
    };
  });
}

/**
 * Which logins are saved accounts rather than guest logins. The callables pass a lookup backed by
 * Firebase Auth; tests pass their own.
 */
export type SavedLoginLookup = (uids: string[]) => Promise<Set<string>>;

/**
 * Write `seasons/{year}/standings` from the season's final weeks. A player is on the standings if
 * they are on the roster or linked to a saved login; guest-only players are weekly only.
 */
export async function recomputeStandings(
  db: Firestore,
  year: string,
  savedLogins: SavedLoginLookup,
): Promise<{ players: number; removed: number }> {
  const weeks = toSeasonWeeks(await loadSeason(db, year));
  const playerIds = [...new Set(weeks.flatMap((w) => w.records.map((r) => r.playerId)))];
  const profiles = playerIds.length
    ? await db.getAll(...playerIds.map((id) => db.doc(`players/${id}`)))
    : [];
  const uids = profiles
    .map((p) => p.get('claimedByUid') as string | null | undefined)
    .filter((uid): uid is string => Boolean(uid));
  const saved = uids.length ? await savedLogins(uids) : new Set<string>();

  const players: StandingsPlayer[] = profiles.map((p) => ({
    playerId: p.id,
    displayName: String(p.get('displayName') ?? ''),
    eligible:
      p.exists && (p.get('origin') === 'admin' || saved.has(String(p.get('claimedByUid') ?? ''))),
  }));
  const rows = buildStandings(weeks, players);

  const collection = db.collection(`seasons/${year}/standings`);
  const existing = await collection.select().get();
  const keep = new Set(rows.map((r) => r.playerId));
  const stale = existing.docs.filter((d) => !keep.has(d.id));

  let batch = db.batch();
  let pending = 0;
  const flush = async () => {
    if (pending > 0) await batch.commit();
    batch = db.batch();
    pending = 0;
  };
  for (const row of rows) {
    const { playerId, ...fields } = row;
    batch.set(collection.doc(playerId), { ...fields, updatedAt: FieldValue.serverTimestamp() });
    if (++pending === 400) await flush();
  }
  for (const doc of stale) {
    batch.delete(doc.ref);
    if (++pending === 400) await flush();
  }
  await flush();
  return { players: rows.length, removed: stale.length };
}

/** Write `players/{id}/stats/allTime` for everyone with an entry in a final week of a real season. */
export async function recomputeAllTime(db: Firestore): Promise<{ players: number }> {
  const seasons = (await db.collection('seasons').select().get()).docs
    .map((d) => d.id)
    .filter((year) => !isTestSeason(year));
  const loaded = await Promise.all(
    seasons.map(async (year) => ({ year, weeks: toSeasonWeeks(await loadSeason(db, year)) })),
  );
  const stats = buildAllTime(loaded);

  let batch = db.batch();
  let pending = 0;
  for (const [playerId, s] of stats) {
    batch.set(db.doc(`players/${playerId}/stats/allTime`), {
      ...s,
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (++pending === 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();
  return { players: stats.size };
}

/** `adminSeasonReport`: the week-by-week table and its facts, in one round trip. */
export async function seasonReport(db: Firestore, year: string): Promise<SeasonReport> {
  return buildSeasonReport(year, await loadSeason(db, year));
}
