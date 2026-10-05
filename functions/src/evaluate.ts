/**
 * Everything the results screen and the publish step need to know about a week, computed from the
 * entries' own picks and payments (not from any stored record), so the preview and the published
 * winner come from the same code (DECISIONS.md D-046, D-047).
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  bestPossibleWins,
  explainOutcome,
  pickWinners,
  scorePicks,
  type Contender,
  type TieGameRule,
  type WinnerOutcome,
  type WinnerResult,
} from '../../shared/scoring';
import type { GameResult, Pick as PickSide } from '../../shared/types';

export interface WeekContender extends Contender {
  remaining: number;
  bestPossible: number;
}

export interface WeekEvaluation {
  gameIds: string[];
  results: Record<string, GameResult>;
  mnfTotal: number | null;
  entryFeeCents: number;
  status: string;
  tieRule: TieGameRule;
  unpaidEligibleToWin: boolean;
  /** All games have a result and the Monday night total is in. Publishing needs this. */
  complete: boolean;
  gamesWithResults: number;
  contenders: WeekContender[];
  winner: WinnerResult;
  explanation: string | null;
}

export async function loadPoolRules(
  db: Firestore,
): Promise<{ tieRule: TieGameRule; unpaidEligibleToWin: boolean }> {
  const config = (await db.doc('config/pool').get()).data() ?? {};
  const tie = config.tieGameRule;
  return {
    tieRule: tie === 'win_for_all' || tie === 'half_win' ? tie : 'no_win', // D-008
    unpaidEligibleToWin: config.unpaidEligibleToWin === true, // D-009
  };
}

export async function evaluateWeek(
  db: Firestore,
  year: string,
  weekId: string,
): Promise<WeekEvaluation | null> {
  const weekRef = db.doc(`seasons/${year}/weeks/${weekId}`);
  const weekSnap = await weekRef.get();
  if (!weekSnap.exists) return null;
  const week = weekSnap.data()!;
  const gameIds: string[] = (week.games ?? []).map((g: { id: string }) => g.id);
  const results: Record<string, GameResult> = week.results ?? {};
  const mnfTotal: number | null = typeof week.mnfTotal === 'number' ? week.mnfTotal : null;
  const { tieRule, unpaidEligibleToWin } = await loadPoolRules(db);

  const entries = await weekRef.collection('entries').get();
  const docs = entries.docs;
  const [payments, picks] = docs.length
    ? await Promise.all([
        db.getAll(...docs.map((e) => e.ref.collection('payment').doc('current')), {
          fieldMask: ['paymentStatus'],
        }),
        db.getAll(...docs.map((e) => e.ref.collection('private').doc('picks'))),
      ])
    : [[], []];

  const contenders: WeekContender[] = docs.map((entry, i) => {
    const pickMap = (picks[i].get('picks') ?? {}) as Record<string, PickSide>;
    const scored = scorePicks(pickMap, results, gameIds, tieRule);
    const guess = picks[i].get('tiebreakerTotal');
    return {
      playerId: entry.id,
      displayName: String(entry.get('displayName') ?? ''),
      wins: scored.wins,
      losses: scored.losses,
      remaining: scored.remaining,
      bestPossible: bestPossibleWins(scored),
      tiebreakerTotal: typeof guess === 'number' ? guess : null,
      paid: payments[i].exists && payments[i].get('paymentStatus') === 'paid',
    };
  });
  contenders.sort((a, b) => b.wins - a.wins || a.displayName.localeCompare(b.displayName));

  const entryFeeCents: number = week.entryFeeCents ?? 2000;
  const winner = pickWinners(contenders, mnfTotal, { entryFeeCents, unpaidEligibleToWin });
  let explanation: string | null = null;
  if (winner.ok) {
    const names = contenders
      .filter((c) => winner.outcome.tiedPlayerIds.includes(c.playerId))
      .map((c) => c.displayName);
    explanation = explainOutcome(winner.outcome, mnfTotal, names);
  }
  const gamesWithResults = gameIds.filter((id) => results[id]).length;

  return {
    gameIds,
    results,
    mnfTotal,
    entryFeeCents,
    status: week.status,
    tieRule,
    unpaidEligibleToWin,
    complete: gamesWithResults === gameIds.length && gameIds.length > 0 && mnfTotal !== null,
    gamesWithResults,
    contenders,
    winner,
    explanation,
  };
}

export type { WinnerOutcome };

/**
 * Write each entry's record (wins and losses so far) onto its public entry document, so
 * leaderboards can read it without reading anyone's picks. Only writes what changed.
 */
export async function writeEntryRecords(
  db: Firestore,
  year: string,
  weekId: string,
): Promise<number> {
  const evaluation = await evaluateWeek(db, year, weekId);
  if (!evaluation) return 0;
  const weekRef = db.doc(`seasons/${year}/weeks/${weekId}`);
  const entries = await weekRef.collection('entries').select('record').get();
  const byId = new Map(entries.docs.map((d) => [d.id, d]));
  const anyResults = evaluation.gamesWithResults > 0;

  let batch = db.batch();
  let pending = 0;
  let written = 0;
  for (const c of evaluation.contenders) {
    const doc = byId.get(c.playerId);
    if (!doc) continue;
    const current = doc.get('record') as { wins: number; losses: number } | undefined;
    if (anyResults) {
      if (current && current.wins === c.wins && current.losses === c.losses) continue;
      batch.update(doc.ref, { record: { wins: c.wins, losses: c.losses } });
    } else {
      if (!current) continue;
      batch.update(doc.ref, { record: FieldValue.delete() });
    }
    written += 1;
    if (++pending === 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();
  return written;
}
