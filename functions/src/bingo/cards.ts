/**
 * Bingo cards (DATA_MODEL §11.2, §11.5). A card is made only in the join window (D-117), within the
 * cap and the member's own limit (D-118), counted inside the transaction because rules can't count.
 * It joins the open game at its first draw and carries over to later games until it is retired.
 */
import type { Firestore } from 'firebase-admin/firestore';
import {
  JOIN_CLOSED_MESSAGE,
  cardsAllowed,
  checkNumbers,
  cutoffAt,
  joinWindowOpen,
  quickPick,
} from '../../../shared/bingo';
import { auditInTransaction } from '../audit';
import {
  actorFields,
  fail,
  paths,
  requireMember,
  requireOpenCycle,
  ts,
  type Actor,
} from './common';

export async function createCard(
  db: Firestore,
  input: Actor & {
    playerId: string;
    /** Six numbers, or null for a quick pick. */
    numbers: unknown;
    /** True when staff enter a paper card for a member. */
    byStaff: boolean;
    now: Date;
    random?: () => number;
  },
): Promise<{ cardId: string; numbers: number[] }> {
  let numbers: number[];
  if (input.numbers === null || input.numbers === undefined) {
    numbers = quickPick(input.random ?? Math.random);
  } else {
    const check = checkNumbers(Array.isArray(input.numbers) ? input.numbers : []);
    if (!check.ok) return fail('invalid-argument', check.message);
    numbers = check.numbers;
  }

  return db.runTransaction(async (tx) => {
    const member = await requireMember(tx, db, input.playerId);
    const cycle = await requireOpenCycle(tx, db);
    const mine = await tx.get(
      db
        .collection('bingoCards')
        .where('playerId', '==', input.playerId)
        .where('active', '==', true),
    );
    const { config } = cycle.data;
    const open = joinWindowOpen({
      now: input.now,
      windowCutoffAt: cutoffAt(cycle.data.firstDraw, config.cutoff),
      approvedDraws: cycle.data.drawsApproved,
      joinWindowDraws: config.joinWindowDraws,
    });
    if (!open) fail('failed-precondition', JOIN_CLOSED_MESSAGE);
    if (mine.size >= config.maxCardsPerPlayer) {
      fail(
        'failed-precondition',
        `That’s the most cards one person can have (${config.maxCardsPerPlayer}).`,
      );
    }
    const allowed = cardsAllowed(member.data, cycle.data.number, config.maxCardsPerPlayer);
    if (allowed === 0) fail('failed-precondition', 'Bingo is paused for this player this game.');
    if (mine.size >= allowed) {
      fail(
        'failed-precondition',
        input.byStaff
          ? `They set their own limit of ${allowed} card${allowed === 1 ? '' : 's'}. Only they can change it.`
          : `Your limit is ${allowed} card${allowed === 1 ? '' : 's'}. You can change it on your cards page.`,
      );
    }

    const ref = db.collection('bingoCards').doc();
    tx.set(ref, {
      playerId: input.playerId,
      numbers,
      active: true,
      createdAt: ts(input.now),
      createdBy: input.actorUid,
      source: input.byStaff ? 'paper' : 'web',
    });
    tx.set(db.doc(paths.entry(cycle.id, ref.id)), {
      playerId: input.playerId,
      joinedDraw: cycle.data.firstDraw,
      paidDraws: [],
      hits: [],
      count: 0,
    });
    tx.update(cycle.ref, { 'board.cards': cycle.data.board.cards + 1 });
    auditInTransaction(tx, db, {
      ...actorFields(input),
      action: 'bingo.cardCreated',
      target: ref.path,
      before: null,
      after: {
        playerId: input.playerId,
        displayName: member.data.displayName,
        numbers,
        cycleId: cycle.id,
      },
    });
    return { cardId: ref.id, numbers };
  });
}

/** Stop a card renewing. Its earlier hits stay; it can't be paid for again (DATA_MODEL §11.5). */
export async function retireCard(
  db: Firestore,
  input: Actor & { cardId: string; playerId: string | null; now: Date },
): Promise<{ retired: true }> {
  await db.runTransaction(async (tx) => {
    const ref = db.doc(paths.card(input.cardId));
    const card = await tx.get(ref);
    if (!card.exists) fail('not-found', 'That card doesn’t exist.');
    // The owner, or the commissioner (playerId null).
    if (input.playerId !== null && card.get('playerId') !== input.playerId) {
      fail('permission-denied', 'That’s not your card.');
    }
    if (card.get('active') !== true) return;
    tx.update(ref, { active: false, retiredAt: ts(input.now), retiredBy: input.actorUid });
    auditInTransaction(tx, db, {
      ...actorFields(input),
      action: 'bingo.cardRetired',
      target: ref.path,
      before: { active: true, playerId: card.get('playerId'), numbers: card.get('numbers') },
      after: { active: false },
    });
  });
  return { retired: true };
}
