/**
 * Bingo money (DATA_MODEL §11.2, §11.5). A member says how they'll pay (`setIntent`); staff record
 * money by when it was received (`setPayment`, D-119), one draw at a time (D-116), within the
 * member's own limit (D-118); winners are marked paid (`setPayout`). The counter handles cash only
 * (D-114). `totals` is the staff view of concentration, as totals only (D-128).
 */
import { FieldValue, type Firestore, type Timestamp } from 'firebase-admin/firestore';
import { parseReason } from '../../../shared/paperEntry';
import { cardsAllowed, creditPayment } from '../../../shared/bingo';
import { auditInTransaction } from '../audit';
import {
  actorFields,
  closedDraws,
  dueDraw,
  fail,
  isCounter,
  newDraw,
  paths,
  readDraws,
  requireMember,
  requireOpenCycle,
  ts,
  yearOf,
  type Actor,
  type CycleDoc,
  type Winner,
} from './common';

type Method = 'cash' | 'etransfer';
const isMethod = (v: unknown): v is Method => v === 'cash' || v === 'etransfer';

const emptyPayment = (playerId: string) => ({
  playerId,
  paid: false,
  method: null,
  receivedAt: null,
  confirmedAt: null,
  confirmedBy: null,
  late: false,
  reason: null,
  intent: null,
});

/** "I'll pay cash" / "I sent an e-Transfer" for this week's draw (D-116). Not audited, like the pool's. */
export async function setIntent(
  db: Firestore,
  input: { playerId: string; cardId: string; intent: unknown },
): Promise<{ drawDate: string }> {
  const intent =
    input.intent === null
      ? null
      : isMethod(input.intent)
        ? input.intent
        : fail('invalid-argument', 'Say cash or e-Transfer.');
  return db.runTransaction(async (tx) => {
    const cycle = await requireOpenCycle(tx, db);
    const entry = await tx.get(db.doc(paths.entry(cycle.id, input.cardId)));
    if (!entry.exists || entry.get('playerId') !== input.playerId)
      fail('permission-denied', 'That’s not your card.');
    const draws = await readDraws(tx, db, cycle.id);
    const drawDate = dueDraw(cycle.data.firstDraw, draws);
    const ref = db.doc(paths.payment(cycle.id, drawDate, input.cardId));
    const payment = await tx.get(ref);
    if (!draws.has(drawDate))
      tx.set(db.doc(paths.draw(cycle.id, drawDate)), newDraw(drawDate, cycle.data.config));
    if (payment.exists) tx.update(ref, { intent });
    else tx.set(ref, { ...emptyPayment(input.playerId), intent });
    return { drawDate };
  });
}

export interface SetPaymentInput extends Actor {
  cardId: string;
  paid: boolean;
  method?: unknown;
  /** When the money was handed over or arrived; defaults to now (D-119). */
  receivedAt?: Date;
  /** For an undo: which draw to take the money off. */
  drawDate?: string;
  reason?: unknown;
  now: Date;
}

export async function setPayment(
  db: Firestore,
  input: SetPaymentInput,
): Promise<{ drawDate: string; paid: boolean; late: boolean }> {
  return db.runTransaction(async (tx) => {
    const cycle = await requireOpenCycle(tx, db);
    const [card, entry] = await Promise.all([
      tx.get(db.doc(paths.card(input.cardId))),
      tx.get(db.doc(paths.entry(cycle.id, input.cardId))),
    ]);
    if (!card.exists || !entry.exists) fail('not-found', 'That card isn’t in this game.');
    const playerId = card.get('playerId') as string;
    const member = await requireMember(tx, db, playerId);
    const draws = await readDraws(tx, db, cycle.id);
    const { config } = cycle.data;

    if (!input.paid) {
      const drawDate =
        input.drawDate ?? fail('invalid-argument', 'Say which draw to take the money off.');
      if (draws.get(drawDate)?.status === 'approved' || draws.get(drawDate)?.status === 'skipped') {
        fail('failed-precondition', 'That draw is done. The money can’t be taken off it now.');
      }
      const ref = db.doc(paths.payment(cycle.id, drawDate, input.cardId));
      const payment = await tx.get(ref);
      if (!payment.exists || payment.get('paid') !== true)
        return { drawDate, paid: false, late: false };
      if (isCounter(input) && payment.get('method') !== 'cash') {
        fail('permission-denied', 'Only the commissioner can undo an e-Transfer.');
      }
      const received = (payment.get('receivedAt') as Timestamp).toDate();
      tx.update(ref, {
        paid: false,
        confirmedAt: null,
        confirmedBy: null,
        receivedAt: null,
        late: false,
        reason: null,
        method: null,
      });
      tx.update(entry.ref, { paidDraws: FieldValue.arrayRemove(drawDate) });
      tx.update(member.ref, {
        [`spent.byCycle.${cycle.id}`]: FieldValue.increment(-config.priceCents),
        [`spent.byYear.${yearOf(received)}`]: FieldValue.increment(-config.priceCents),
      });
      auditInTransaction(tx, db, {
        ...actorFields(input),
        action: 'bingo.payment',
        target: ref.path,
        before: { paid: true, method: payment.get('method'), displayName: member.data.displayName },
        after: { paid: false, displayName: member.data.displayName },
      });
      return { drawDate, paid: false, late: false };
    }

    if (card.get('active') !== true)
      fail('failed-precondition', 'That card was retired. It can’t be paid for again.');
    if (!isMethod(input.method)) fail('invalid-argument', 'Say cash or e-Transfer.');
    if (isCounter(input) && input.method !== 'cash') {
      fail(
        'permission-denied',
        'Only the commissioner can confirm an e-Transfer, against the bank.',
      );
    }
    const receivedAt = input.receivedAt ?? input.now;
    const { approved, skipped } = closedDraws(draws);
    const credit = creditPayment({
      receivedAt,
      now: input.now,
      cutoff: config.cutoff,
      dueDraw: dueDraw(cycle.data.firstDraw, draws),
      approvedDraws: approved,
      skippedDraws: skipped,
    });
    if (!credit.ok) return fail('failed-precondition', credit.message);
    let reason: string | null = null;
    if (credit.needsReason) {
      const parsed = parseReason(
        input.reason,
        credit.late ? 'taking money after the cutoff' : 'setting an earlier time',
      );
      if (!parsed.ok) return fail('invalid-argument', parsed.message);
      reason = parsed.value;
    }
    const { drawDate } = credit;
    if (cycle.data.drawsApproved >= config.maxWeeks)
      fail('failed-precondition', 'This game has reached its last draw.');

    const ref = db.doc(paths.payment(cycle.id, drawDate, input.cardId));
    const [payment, othersPaid] = await Promise.all([
      tx.get(ref),
      tx.get(
        db
          .collection(`${paths.draw(cycle.id, drawDate)}/payments`)
          .where('playerId', '==', playerId)
          .where('paid', '==', true),
      ),
    ]);
    if (payment.get('paid') === true)
      return { drawDate, paid: true, late: payment.get('late') === true };
    const allowed = cardsAllowed(member.data, cycle.data.number, config.maxCardsPerPlayer);
    if (othersPaid.size >= allowed) {
      fail(
        'failed-precondition',
        allowed === 0
          ? `${member.data.displayName} paused bingo for this game.`
          : `${member.data.displayName} set a limit of ${allowed} card${allowed === 1 ? '' : 's'} a draw. Only they can change it.`,
      );
    }

    if (!draws.has(drawDate))
      tx.set(db.doc(paths.draw(cycle.id, drawDate)), newDraw(drawDate, config));
    const after = {
      playerId,
      paid: true,
      method: input.method,
      receivedAt: ts(receivedAt),
      confirmedAt: ts(input.now),
      confirmedBy: input.actorUid,
      late: credit.late,
      reason,
    };
    if (payment.exists) tx.update(ref, after);
    else tx.set(ref, { ...emptyPayment(playerId), ...after });
    tx.update(entry.ref, { paidDraws: FieldValue.arrayUnion(drawDate) });
    tx.update(member.ref, {
      [`spent.byCycle.${cycle.id}`]: FieldValue.increment(config.priceCents),
      [`spent.byYear.${yearOf(receivedAt)}`]: FieldValue.increment(config.priceCents),
    });
    auditInTransaction(tx, db, {
      ...actorFields(input),
      action: 'bingo.payment',
      target: ref.path,
      before: { paid: false, displayName: member.data.displayName },
      after: {
        paid: true,
        method: input.method,
        late: credit.late,
        drawDate,
        receivedAt: receivedAt.toISOString(),
        displayName: member.data.displayName,
      },
      ...(reason ? { reason } : {}),
    });
    return { drawDate, paid: true, late: credit.late };
  });
}

/** Mark a winner's share paid (D-114: the counter, cash only), or unmark it (the commissioner). */
export async function setPayout(
  db: Firestore,
  input: Actor & { cycleId: string; cardId: string; paid: boolean; method?: unknown; now: Date },
): Promise<{ paid: boolean }> {
  if (input.paid && !isMethod(input.method)) fail('invalid-argument', 'Say cash or e-Transfer.');
  if (isCounter(input) && (!input.paid || input.method !== 'cash')) {
    fail('permission-denied', 'The counter can mark a cash payout only. Ask the commissioner.');
  }
  await db.runTransaction(async (tx) => {
    const ref = db.doc(paths.cycle(input.cycleId));
    const snap = await tx.get(ref);
    if (!snap.exists) fail('not-found', 'That game doesn’t exist.');
    const cycle = snap.data() as CycleDoc;
    const winners = (cycle.winners ?? []).map((w) => ({ ...w }));
    const i = winners.findIndex((w) => w.cardId === input.cardId);
    if (i < 0) fail('not-found', 'That card didn’t win this game.');
    const before: Winner = winners[i];
    if ((before.paidOut !== null) === input.paid) return;
    winners[i] = {
      ...before,
      paidOut: input.paid
        ? { method: input.method as Method, at: ts(input.now), by: input.actorUid }
        : null,
    };
    tx.update(ref, { winners });
    auditInTransaction(tx, db, {
      ...actorFields(input),
      action: 'bingo.payout',
      target: ref.path,
      before: {
        cardId: before.cardId,
        displayName: before.displayName,
        paidOut: before.paidOut !== null,
      },
      after: {
        cardId: before.cardId,
        displayName: before.displayName,
        paidOut: input.paid,
        method: input.paid ? input.method : null,
        shareCents: before.shareCents,
      },
    });
  });
  return { paid: input.paid };
}

export interface DrawTotals {
  drawDate: string;
  paidCards: number;
  players: number;
  /** Share of this draw's paid cards from players with 4 or 5 paid. */
  heavyShare: number;
  /** Players at the most cards one person can have. */
  atCap: number;
}

/** The staff view of concentration for the open game: totals only, no names (D-128). */
export async function totals(
  db: Firestore,
): Promise<{ cycleId: string | null; test: boolean; draws: DrawTotals[] }> {
  const open = await db.collection('bingoCycles').where('status', '==', 'open').limit(1).get();
  if (open.empty) return { cycleId: null, test: false, draws: [] };
  const cycle = open.docs[0];
  const max = (cycle.get('config.maxCardsPerPlayer') as number) ?? 5;
  const drawSnap = await cycle.ref.collection('draws').get();
  const out: DrawTotals[] = [];
  for (const d of drawSnap.docs.sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const paid = await d.ref.collection('payments').where('paid', '==', true).get();
    const per = new Map<string, number>();
    for (const p of paid.docs) per.set(p.get('playerId'), (per.get(p.get('playerId')) ?? 0) + 1);
    const heavy = [...per.values()].filter((n) => n >= 4).reduce((a, b) => a + b, 0);
    out.push({
      drawDate: d.id,
      paidCards: paid.size,
      players: per.size,
      heavyShare: paid.size ? heavy / paid.size : 0,
      atCap: [...per.values()].filter((n) => n >= max).length,
    });
  }
  return { cycleId: cycle.id, test: cycle.get('test') === true, draws: out };
}
