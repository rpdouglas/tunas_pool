/**
 * Bingo draws (DATA_MODEL §11.3, §11.5). Staff type the six numbers after the cutoff (`proposed`,
 * D-126); the admin or the counter approves, and the whole game is worked out again. The admin
 * alone corrects or skips (D-114). A correction after approval is allowed until a payout from
 * that game is marked, and if it takes a win away the game reopens, but only while nothing has
 * been paid or approved in the game opened after it (D-129).
 */
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { addDays } from '../../../shared/time';
import { checkNumbers, cutoffAt } from '../../../shared/bingo';
import { parseReason } from '../../../shared/paperEntry';
import { auditInTransaction } from '../audit';
import {
  actorFields,
  dueDraw,
  fail,
  newDraw,
  paths,
  requireOpenCycle,
  ts,
  type Actor,
  type CycleDoc,
} from './common';
import { loadCycle, writeCycle, type WriteOutcome } from './cycle';

function numbersOf(value: unknown): number[] {
  const check = checkNumbers(Array.isArray(value) ? value : []);
  if (!check.ok) return fail('invalid-argument', check.message);
  return check.numbers;
}

/** Type in a draw's numbers (manual, D-126). Allowed once its cutoff has passed, until approved. */
export async function enterDraw(
  db: Firestore,
  input: Actor & { numbers: unknown; source?: string; now: Date },
): Promise<{ cycleId: string; drawDate: string }> {
  const numbers = numbersOf(input.numbers);
  return db.runTransaction(async (tx) => {
    const cycle = await requireOpenCycle(tx, db);
    const drawSnap = await tx.get(db.collection(`${paths.cycle(cycle.id)}/draws`));
    const draws = new Map(drawSnap.docs.map((d) => [d.id, d.data() as never]));
    const drawDate = dueDraw(cycle.data.firstDraw, draws);
    if (input.now.getTime() < cutoffAt(drawDate, cycle.data.config.cutoff).getTime()) {
      fail(
        'failed-precondition',
        `The ${drawDate} draw hasn’t happened yet. Numbers go in after the 6 PM cutoff.`,
      );
    }
    const ref = db.doc(paths.draw(cycle.id, drawDate));
    const before = drawSnap.docs.find((d) => d.id === drawDate);
    const fields = {
      status: 'proposed',
      numbers,
      source: input.source ?? 'manual',
      proposedBy: input.actorUid,
      proposedAt: ts(input.now),
    };
    if (before) tx.update(ref, fields);
    else tx.set(ref, { ...newDraw(drawDate, cycle.data.config), ...fields });
    auditInTransaction(tx, db, {
      ...actorFields(input),
      action: 'bingo.drawEntered',
      target: ref.path,
      before: before ? { status: before.get('status'), numbers: before.get('numbers') } : null,
      after: { status: 'proposed', numbers },
    });
    return { cycleId: cycle.id, drawDate };
  });
}

/** Approve the proposed draw: crossed-off numbers, the pot, and any win are worked out again. */
export async function approveDraw(
  db: Firestore,
  input: Actor & { drawDate: string; now: Date },
): Promise<{ cycleId: string } & WriteOutcome> {
  return db.runTransaction(async (tx) => {
    const cycle = await requireOpenCycle(tx, db);
    const state = await loadCycle(tx, db, cycle.id, input.now);
    const draw = state.draws.get(input.drawDate);
    if (!draw || draw.status !== 'proposed')
      fail('failed-precondition', 'That draw isn’t waiting for approval.');
    if (dueDraw(cycle.data.firstDraw, state.draws) !== input.drawDate) {
      fail(
        'failed-precondition',
        'An earlier draw is still waiting. Approve or skip that one first.',
      );
    }
    draw!.status = 'approved';
    const ref = db.doc(paths.draw(cycle.id, input.drawDate));
    tx.update(ref, { status: 'approved', approvedBy: input.actorUid, approvedAt: ts(input.now) });
    auditInTransaction(tx, db, {
      ...actorFields(input),
      action: 'bingo.drawApproved',
      target: ref.path,
      before: { status: 'proposed' },
      after: { status: 'approved', numbers: draw!.numbers },
    });
    const outcome = writeCycle(tx, db, state, input.now, input);
    return { cycleId: cycle.id, ...outcome };
  });
}

/** Everything under a cycle, for removing a game opened by a win that a correction took away. */
async function readWholeCycle(tx: Transaction, db: Firestore, cycleId: string) {
  const base = paths.cycle(cycleId);
  const [entries, draws] = await Promise.all([
    tx.get(db.collection(`${base}/entries`)),
    tx.get(db.collection(`${base}/draws`)),
  ]);
  const payments = await Promise.all(draws.docs.map((d) => tx.get(d.ref.collection('payments'))));
  return { entries, draws, payments };
}

/**
 * Change a draw's numbers, with a reason (admin only). Before approval it is just a fix. After, the
 * game is worked out again. If that changes when the game ended, see D-129.
 */
export async function correctDraw(
  db: Firestore,
  input: Actor & {
    cycleId: string;
    drawDate: string;
    numbers: unknown;
    reason: unknown;
    now: Date;
  },
): Promise<{ cycleId: string; reopened: boolean } & WriteOutcome> {
  const numbers = numbersOf(input.numbers);
  const reason = parseReason(input.reason, 'correcting the draw');
  if (!reason.ok) return fail('invalid-argument', reason.message);

  return db.runTransaction(async (tx) => {
    const state = await loadCycle(tx, db, input.cycleId, input.now);
    const draw = state.draws.get(input.drawDate);
    if (!draw || (draw.status !== 'proposed' && draw.status !== 'approved')) {
      fail('failed-precondition', 'Only a typed-in or approved draw can be corrected.');
    }
    const { cycle } = state;
    if ((cycle.winners ?? []).some((w) => w.paidOut !== null)) {
      fail(
        'failed-precondition',
        'A winner from this game has been paid. The commissioner has to settle it by hand.',
      );
    }
    // Reads for a game opened after this one, in case the correction reopens this one.
    const nextSnap =
      cycle.status !== 'open'
        ? await tx.get(
            db
              .collection('bingoCycles')
              .where('number', '==', cycle.number + 1)
              .limit(1),
          )
        : null;
    const next = nextSnap && !nextSnap.empty ? nextSnap.docs[0] : null;
    const nextAll = next ? await readWholeCycle(tx, db, next.id) : null;

    const before = draw!.numbers;
    draw!.numbers = numbers;
    const ref = db.doc(paths.draw(input.cycleId, input.drawDate));
    tx.update(ref, {
      numbers,
      correction: { before, reason: reason.value, by: input.actorUid, at: ts(input.now) },
    });
    auditInTransaction(tx, db, {
      ...actorFields(input),
      action: 'bingo.drawCorrected',
      target: ref.path,
      before: { numbers: before, status: draw!.status },
      after: { numbers, status: draw!.status },
      reason: reason.value,
    });
    if (draw!.status === 'proposed')
      return { cycleId: input.cycleId, reopened: false, kind: 'open' as const };

    if (cycle.status === 'open') {
      return {
        cycleId: input.cycleId,
        reopened: false,
        ...writeCycle(tx, db, state, input.now, input),
      };
    }

    // The game was closed. Work it out again without opening a new one, and see what changed.
    const outcome = writeCycle(tx, db, state, input.now, input, { openNext: false });
    const sameEnd = outcome.kind !== 'open' && outcome.closingDraw === cycle.closingDraw;
    if (sameEnd) return { cycleId: input.cycleId, reopened: false, ...outcome };
    if (outcome.kind !== 'open') {
      fail(
        'failed-precondition',
        'That correction would change which draw ended the game. The commissioner has to settle it by hand.',
      );
    }
    // The win is gone: the game reopens, and the game opened after it is removed if nothing has happened in it.
    if (next && nextAll) {
      const busy =
        (next.data() as CycleDoc).drawsApproved > 0 ||
        nextAll.draws.docs.some((d) => d.get('status') === 'approved') ||
        nextAll.payments.some((p) => p.docs.some((d) => d.get('paid') === true));
      if (busy) {
        fail(
          'failed-precondition',
          'The next game has already taken money. The commissioner has to settle it by hand.',
        );
      }
      for (const p of nextAll.payments) for (const d of p.docs) tx.delete(d.ref);
      for (const d of nextAll.draws.docs) tx.delete(d.ref);
      for (const d of nextAll.entries.docs) tx.delete(d.ref);
      tx.delete(next.ref);
      auditInTransaction(tx, db, {
        ...actorFields(input),
        action: 'bingo.cycle',
        target: next.ref.path,
        before: { status: 'open', number: cycle.number + 1 },
        after: null,
        reason: reason.value,
      });
    }
    // The draw after the old closing draw is where money is due again.
    const due = dueDraw(cycle.firstDraw, state.draws);
    if (!state.draws.has(due))
      tx.set(db.doc(paths.draw(input.cycleId, due)), newDraw(due, cycle.config));
    return { cycleId: input.cycleId, reopened: true, kind: 'open' as const };
  });
}

/**
 * Skip a cancelled or postponed draw (admin only, D-129). No card changes, it doesn't count toward
 * the cap, and money paid for it moves to the next draw.
 */
export async function skipDraw(
  db: Firestore,
  input: Actor & { drawDate: string; reason: unknown; now: Date },
): Promise<{ moved: number; nextDraw: string }> {
  const reason = parseReason(input.reason, 'skipping the draw');
  if (!reason.ok) return fail('invalid-argument', reason.message);
  return db.runTransaction(async (tx) => {
    const cycle = await requireOpenCycle(tx, db);
    const all = await readWholeCycle(tx, db, cycle.id);
    const draws = new Map(all.draws.docs.map((d) => [d.id, d.data() as never]));
    if (dueDraw(cycle.data.firstDraw, draws) !== input.drawDate) {
      fail('failed-precondition', 'Only the draw that’s due can be skipped.');
    }
    const i = all.draws.docs.findIndex((d) => d.id === input.drawDate);
    const nextDraw = addDays(input.drawDate, 7);
    const paidHere = i >= 0 ? all.payments[i].docs.filter((d) => d.get('paid') === true) : [];
    const nextIdx = all.draws.docs.findIndex((d) => d.id === nextDraw);
    const paidNext = new Set(
      nextIdx >= 0
        ? all.payments[nextIdx].docs.filter((d) => d.get('paid') === true).map((d) => d.id)
        : [],
    );

    const ref = db.doc(paths.draw(cycle.id, input.drawDate));
    if (i >= 0)
      tx.update(ref, {
        status: 'skipped',
        skippedBy: input.actorUid,
        skippedAt: ts(input.now),
        skipReason: reason.value,
      });
    else
      tx.set(ref, {
        ...newDraw(input.drawDate, cycle.data.config),
        status: 'skipped',
        skippedBy: input.actorUid,
        skippedAt: ts(input.now),
        skipReason: reason.value,
      });
    if (nextIdx < 0)
      tx.set(db.doc(paths.draw(cycle.id, nextDraw)), newDraw(nextDraw, cycle.data.config));

    let moved = 0;
    for (const p of paidHere) {
      // A card already paid (late) for next week keeps that; the moved money goes to the week after.
      const to = paidNext.has(p.id) ? addDays(nextDraw, 7) : nextDraw;
      if (to !== nextDraw)
        tx.set(db.doc(paths.draw(cycle.id, to)), newDraw(to, cycle.data.config), { merge: true });
      tx.set(db.doc(paths.payment(cycle.id, to, p.id)), { ...p.data(), movedFrom: input.drawDate });
      tx.delete(p.ref);
      const entry = db.doc(paths.entry(cycle.id, p.id));
      const paidDraws = (
        (all.entries.docs.find((e) => e.id === p.id)?.get('paidDraws') as string[]) ?? []
      ).filter((d) => d !== input.drawDate);
      tx.update(entry, { paidDraws: [...new Set([...paidDraws, to])].sort() });
      moved++;
    }
    auditInTransaction(tx, db, {
      ...actorFields(input),
      action: 'bingo.drawSkipped',
      target: ref.path,
      before: { status: i >= 0 ? all.draws.docs[i].get('status') : 'upcoming' },
      after: { status: 'skipped', moved, nextDraw },
      reason: reason.value,
    });
    return { moved, nextDraw };
  });
}
