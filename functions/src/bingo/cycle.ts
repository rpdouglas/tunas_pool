/**
 * Working out a cycle and opening the next (DATA_MODEL §11.3, §11.4). `loadCycle` does every read a
 * change needs (Firestore transactions read before they write); the caller changes the draws in
 * memory; `writeCycle` works the whole cycle out again with `evaluateCycle` and writes the result,
 * closing the cycle on a win or the cap and opening the next one. Nothing is added to, so running
 * it twice, or after a correction, gives the same answer (D-113).
 */
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { drawFor, evaluateCycle, type CycleDraw } from '../../../shared/bingo';
import { auditInTransaction } from '../audit';
import {
  actorFields,
  fail,
  newDraw,
  paths,
  readConfig,
  ts,
  type Actor,
  type CycleDoc,
  type DrawDoc,
  type StoredConfig,
  type Winner,
} from './common';

export interface CycleState {
  id: string;
  cycle: CycleDoc;
  draws: Map<string, DrawDoc & Record<string, unknown>>;
  entries: { cardId: string; playerId: string; paidDraws: string[] }[];
  numbers: Map<string, number[]>;
  names: Map<string, string>;
  /** Every active card, for the next cycle's entries. */
  activeCards: { cardId: string; playerId: string }[];
  config: StoredConfig;
  /** Where the next cycle would open, and whether that ID is taken. */
  next: { firstDraw: string; taken: boolean };
  /** Payment documents under draws not yet approved or skipped, for moving on when the game ends. */
  pending: {
    drawDate: string;
    cardId: string;
    ref: DocumentReference;
    data: Record<string, unknown>;
  }[];
}

export async function loadCycle(
  tx: Transaction,
  db: Firestore,
  cycleId: string,
  now: Date,
): Promise<CycleState> {
  const cycleSnap = await tx.get(db.doc(paths.cycle(cycleId)));
  if (!cycleSnap.exists) fail('not-found', 'That game doesn’t exist.');
  const cycle = cycleSnap.data() as CycleDoc;
  const config = await readConfig(tx, db);
  const [drawSnap, entrySnap, activeSnap, memberSnap] = await Promise.all([
    tx.get(db.collection(`${paths.cycle(cycleId)}/draws`)),
    tx.get(db.collection(`${paths.cycle(cycleId)}/entries`)),
    tx.get(db.collection('bingoCards').where('active', '==', true)),
    tx.get(db.collection('bingoMembers')),
  ]);
  const entries = entrySnap.docs.map((d) => ({
    cardId: d.id,
    playerId: d.get('playerId') as string,
    paidDraws: (d.get('paidDraws') as string[]) ?? [],
  }));
  const activeIds = new Set(activeSnap.docs.map((d) => d.id));
  const retired = entries.filter((e) => !activeIds.has(e.cardId));
  const retiredSnaps = retired.length
    ? await tx.getAll(...retired.map((e) => db.doc(paths.card(e.cardId))))
    : [];
  const numbers = new Map<string, number[]>();
  for (const d of [...activeSnap.docs, ...retiredSnaps])
    numbers.set(d.id, d.get('numbers') as number[]);
  const firstDraw = drawFor(now, config.cutoff);
  const taken = (await tx.get(db.doc(paths.cycle(firstDraw)))).exists && firstDraw !== cycleId;
  const openDraws = drawSnap.docs.filter((d) => ['upcoming', 'proposed'].includes(d.get('status')));
  const pendingSnaps = await Promise.all(
    openDraws.map((d) => tx.get(d.ref.collection('payments'))),
  );
  const pending = pendingSnaps.flatMap((snap, i) =>
    snap.docs.map((p) => ({ drawDate: openDraws[i].id, cardId: p.id, ref: p.ref, data: p.data() })),
  );
  return {
    id: cycleId,
    cycle,
    draws: new Map(drawSnap.docs.map((d) => [d.id, d.data() as DrawDoc & Record<string, unknown>])),
    entries,
    numbers,
    names: new Map(memberSnap.docs.map((d) => [d.id, d.get('displayName') as string])),
    activeCards: activeSnap.docs.map((d) => ({
      cardId: d.id,
      playerId: d.get('playerId') as string,
    })),
    config,
    next: { firstDraw, taken },
    pending,
  };
}

export type WriteOutcome =
  | { kind: 'open' }
  | { kind: 'won' | 'capped'; closingDraw: string; winners: Winner[]; nextCycleId: string | null }
  | { kind: 'carried'; closingDraw: string; carriedCents: number; nextCycleId: string | null };

/**
 * Work the cycle out and write it. `openNext` is false when a correction re-closes a cycle whose
 * next cycle already exists.
 */
export function writeCycle(
  tx: Transaction,
  db: Firestore,
  state: CycleState,
  now: Date,
  actor: Actor,
  options: { openNext: boolean } = { openNext: true },
): WriteOutcome {
  const { cycle } = state;
  const draws: CycleDraw[] = [...state.draws].map(([date, d]) => ({
    date,
    status: d.status,
    numbers: d.numbers,
  }));
  const result = evaluateCycle({
    config: cycle.config,
    draws,
    entries: state.entries.map((e) => ({ ...e, numbers: state.numbers.get(e.cardId) ?? [] })),
    carriedInCents: cycle.carriedInCents ?? 0,
  });
  if (result.afterClose.length > 0) {
    fail(
      'failed-precondition',
      `This game would already have ended on ${result.outcome.kind === 'open' ? '' : result.outcome.closingDraw}, before ${result.afterClose.join(', ')}. The commissioner has to settle it by hand.`,
    );
  }

  for (const e of result.entries) {
    tx.update(db.doc(paths.entry(state.id, e.cardId)), { hits: e.hits, count: e.count });
  }
  for (const m of result.draws) {
    tx.update(db.doc(paths.draw(state.id, m.date)), {
      paidCards: m.paidCards,
      revenueCents: m.revenueCents,
      operatorCents: m.operatorCents,
      potAddCents: m.potAddCents,
    });
  }
  const cycleRef = db.doc(paths.cycle(state.id));
  const totals = {
    potCents: result.potCents,
    operatorCents: result.operatorCents,
    drawsApproved: result.drawsApproved,
    board: result.board,
  };

  if (result.outcome.kind === 'open') {
    tx.update(cycleRef, {
      ...totals,
      status: 'open',
      closedAt: null,
      closingDraw: null,
      winners: [],
      carriedOutCents: 0,
    });
    return { kind: 'open' };
  }

  const outcome = result.outcome;
  const hits = new Map(result.entries.map((e) => [e.cardId, e.count]));
  const playerOf = new Map(state.entries.map((e) => [e.cardId, e.playerId]));
  const winners: Winner[] =
    outcome.kind === 'carried'
      ? []
      : outcome.winners.map((w) => {
          const playerId = playerOf.get(w.cardId)!;
          return {
            cardId: w.cardId,
            playerId,
            displayName: state.names.get(playerId) ?? 'A member',
            hits: hits.get(w.cardId) ?? 0,
            shareCents: w.shareCents,
            paidOut: null,
          };
        });
  const carriedOutCents = outcome.kind === 'carried' ? outcome.carriedCents : 0;
  tx.update(cycleRef, {
    ...totals,
    status: outcome.kind === 'won' ? 'won' : 'capped',
    closedAt: ts(now),
    closingDraw: outcome.closingDraw,
    winners,
    carriedOutCents,
  });
  auditInTransaction(tx, db, {
    ...actorFields(actor),
    action: 'bingo.cycle',
    target: cycleRef.path,
    before: { status: cycle.status },
    after: {
      status: outcome.kind === 'won' ? 'won' : 'capped',
      closingDraw: outcome.closingDraw,
      potCents: result.potCents,
      winners: winners.map((w) => ({
        cardId: w.cardId,
        displayName: w.displayName,
        shareCents: w.shareCents,
      })),
      carriedOutCents,
    },
  });

  // Draws after the one that ended the game won't happen in it. Money already taken for them
  // (late money, D-119) moves to the same draw in the next game, or its first draw; intents go.
  const after = state.pending.filter((p) => p.drawDate > outcome.closingDraw);
  const active = new Set(state.activeCards.map((c) => c.cardId));
  const moving = after.filter((p) => p.data.paid === true && active.has(p.cardId));
  const moved = new Map<string, { drawDate: string; data: Record<string, unknown> }[]>();
  for (const p of after) tx.delete(p.ref);
  for (const date of new Set(after.map((p) => p.drawDate)))
    tx.delete(db.doc(paths.draw(state.id, date)));
  for (const date of [...state.draws.keys()].filter((d) => d > outcome.closingDraw)) {
    tx.delete(db.doc(paths.draw(state.id, date)));
  }
  for (const p of moving) {
    const drawDate = p.drawDate > state.next.firstDraw ? p.drawDate : state.next.firstDraw;
    moved.set(p.cardId, [
      ...(moved.get(p.cardId) ?? []),
      { drawDate, data: { ...p.data, movedFrom: state.id } },
    ]);
    tx.update(db.doc(paths.entry(state.id, p.cardId)), {
      paidDraws: FieldValue.arrayRemove(p.drawDate),
    });
  }

  let nextCycleId: string | null = null;
  if (options.openNext) {
    nextCycleId = openNewCycle(tx, db, state, now, actor, {
      number: cycle.number + 1,
      carriedInCents: carriedOutCents,
      test: cycle.test,
      moved,
    });
    const price = cycle.config.priceCents;
    for (const p of moving) {
      const playerId = p.data.playerId as string;
      tx.update(db.doc(paths.member(playerId)), {
        [`spent.byCycle.${state.id}`]: FieldValue.increment(-price),
        [`spent.byCycle.${nextCycleId}`]: FieldValue.increment(price),
      });
    }
  } else if (moving.length > 0) {
    fail(
      'failed-precondition',
      'Money was taken for draws after this game ended. The commissioner has to settle it by hand.',
    );
  }
  return outcome.kind === 'carried'
    ? {
        kind: 'carried',
        closingDraw: outcome.closingDraw,
        carriedCents: carriedOutCents,
        nextCycleId,
      }
    : { kind: outcome.kind, closingDraw: outcome.closingDraw, winners, nextCycleId };
}

/** Open a cycle with today's settings; every active card joins at its first draw (D-117). */
export function openNewCycle(
  tx: Transaction,
  db: Firestore,
  state: Pick<CycleState, 'config' | 'activeCards' | 'next'>,
  now: Date,
  actor: Actor,
  input: {
    number: number;
    carriedInCents: number;
    test: boolean;
    /** Money moved from the game that just ended, by card. */
    moved?: Map<string, { drawDate: string; data: Record<string, unknown> }[]>;
  },
): string {
  const { firstDraw, taken } = state.next;
  if (taken)
    fail(
      'failed-precondition',
      `A game starting ${firstDraw} already exists. Ask the commissioner to check the records.`,
    );
  const config = {
    priceCents: state.config.priceCents,
    operatorPct: state.config.operatorPct,
    cutoff: state.config.cutoff,
    maxCardsPerPlayer: state.config.maxCardsPerPlayer,
    maxWeeks: state.config.maxWeeks,
    joinWindowDraws: state.config.joinWindowDraws,
  };
  const id = firstDraw;
  const ref = db.doc(paths.cycle(id));
  tx.set(ref, {
    number: input.number,
    status: 'open',
    test: input.test,
    openedAt: ts(now),
    closedAt: null,
    firstDraw,
    config,
    potCents: input.carriedInCents,
    operatorCents: 0,
    drawsApproved: 0,
    carriedInCents: input.carriedInCents,
    carriedOutCents: 0,
    board: { at3: 0, at4: 0, at5: 0, cards: state.activeCards.length },
    winners: [],
    closingDraw: null,
  });
  const moved =
    input.moved ?? new Map<string, { drawDate: string; data: Record<string, unknown> }[]>();
  const drawDates = new Set([firstDraw, ...[...moved.values()].flat().map((m) => m.drawDate)]);
  for (const date of drawDates) tx.set(db.doc(paths.draw(id, date)), newDraw(date, config));
  for (const c of state.activeCards) {
    const money = moved.get(c.cardId) ?? [];
    for (const m of money) tx.set(db.doc(paths.payment(id, m.drawDate, c.cardId)), m.data);
    tx.set(db.doc(paths.entry(id, c.cardId)), {
      playerId: c.playerId,
      joinedDraw: firstDraw,
      paidDraws: money.map((m) => m.drawDate).sort(),
      hits: [],
      count: 0,
    });
  }
  auditInTransaction(tx, db, {
    ...actorFields(actor),
    action: 'bingo.cycle',
    target: ref.path,
    before: null,
    after: {
      status: 'open',
      number: input.number,
      firstDraw,
      test: input.test,
      carriedInCents: input.carriedInCents,
      priceCents: config.priceCents,
      operatorPct: config.operatorPct,
    },
  });
  return id;
}

/** The first game (or the first after a gap): admin only. Refused while one is open. */
export async function startCycle(
  db: Firestore,
  input: Actor & { test: boolean; now: Date },
): Promise<{ cycleId: string }> {
  return db.runTransaction(async (tx) => {
    const config = await readConfig(tx, db);
    const [open, last, activeSnap] = await Promise.all([
      tx.get(db.collection('bingoCycles').where('status', '==', 'open').limit(1)),
      tx.get(db.collection('bingoCycles').orderBy('number', 'desc').limit(1)),
      tx.get(db.collection('bingoCards').where('active', '==', true)),
    ]);
    if (!open.empty) fail('failed-precondition', 'A game is already open.');
    const firstDraw = drawFor(input.now, config.cutoff);
    const taken = (await tx.get(db.doc(paths.cycle(firstDraw)))).exists;
    const prev = last.docs[0];
    const cycleId = openNewCycle(
      tx,
      db,
      {
        config,
        activeCards: activeSnap.docs.map((d) => ({
          cardId: d.id,
          playerId: d.get('playerId') as string,
        })),
        next: { firstDraw, taken },
      },
      input.now,
      input,
      {
        number: prev ? (prev.get('number') as number) + 1 : 1,
        carriedInCents: prev ? ((prev.get('carriedOutCents') as number) ?? 0) : 0,
        test: input.test,
      },
    );
    return { cycleId };
  });
}
