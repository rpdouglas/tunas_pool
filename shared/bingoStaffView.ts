/**
 * Weekly 649 Bingo, the staff side in plain words (BINGO_PLAN S15). Pure, so what the commissioner
 * and the counter read is tested. Totals stay totals: nothing here ranks or names spenders (D-128).
 */
import { checkNumbers, type BingoDrawStatus } from './bingo';
import { drawDay } from './bingoView';

/** Six numbers typed in one box, any separators: "4 5 6 33 34 35" or "4,5,6,33,34,35". */
export function parseDrawNumbers(
  text: string,
): { ok: true; numbers: number[] } | { ok: false; message: string } {
  const parts = text.split(/[^0-9]+/).filter(Boolean);
  if (parts.length !== 6)
    return { ok: false, message: `Type six numbers. That's ${parts.length}.` };
  return checkNumbers(parts.map(Number));
}

export type DrawStep = 'before-cutoff' | 'needs-numbers' | 'waiting-approval';

/** Where this week's draw stands for staff, and what to do next. */
export function drawStep(
  status: BingoDrawStatus | null,
  nowMs: number,
  cutoffAtMs: number,
): DrawStep {
  if (status === 'proposed') return 'waiting-approval';
  return nowMs < cutoffAtMs ? 'before-cutoff' : 'needs-numbers';
}

export function drawStepText(
  step: DrawStep,
  drawDate: string,
  numbers: readonly number[] | null,
): string {
  const day = drawDay(drawDate);
  switch (step) {
    case 'before-cutoff':
      return `The ${day} draw: numbers go in after the 6 PM cutoff.`;
    case 'needs-numbers':
      return `Type in the ${day} numbers from the official Lotto 6/49 result. The bonus number doesn't count.`;
    case 'waiting-approval':
      return `The ${day} draw is waiting for approval: ${(numbers ?? []).join(' ')}. Check it against the official result.`;
  }
}

/** The Back Office banner (R-22), or null. */
export function bannerText(waiting: { drawDate: string } | null): string | null {
  return waiting ? `A bingo draw is waiting for approval (${drawDay(waiting.drawDate)}).` : null;
}

export interface StaffCardInput {
  cardId: string;
  playerId: string;
  numbers: number[];
}

export interface StaffPayment {
  paid: boolean;
  method: 'cash' | 'etransfer' | null;
  late: boolean;
  intent: 'cash' | 'etransfer' | null;
}

export interface PaymentRowData {
  cardId: string;
  playerId: string;
  displayName: string;
  /** "Card 2 of 3" for people with more than one. */
  label: string;
  numbers: number[];
  /** This week's draw. */
  due: StaffPayment | null;
  /** Already paid (late) for next week's. */
  paidNext: boolean;
  /** How the late money came, so only the commissioner undoes an e-Transfer. */
  nextMethod: 'cash' | 'etransfer' | null;
  paper: boolean;
}

/** Every card in the game for this week's payments, by name, then card. */
export function paymentRows(input: {
  cards: StaffCardInput[];
  members: Map<string, { displayName: string; paper: boolean }>;
  due: Map<string, StaffPayment>;
  next: Map<string, StaffPayment>;
}): PaymentRowData[] {
  const byPlayer = new Map<string, StaffCardInput[]>();
  for (const c of input.cards) byPlayer.set(c.playerId, [...(byPlayer.get(c.playerId) ?? []), c]);
  const rows: PaymentRowData[] = [];
  for (const [playerId, cards] of byPlayer) {
    const member = input.members.get(playerId);
    cards.forEach((c, i) =>
      rows.push({
        cardId: c.cardId,
        playerId,
        displayName: member?.displayName ?? 'A member',
        label: cards.length > 1 ? `Card ${i + 1} of ${cards.length}` : 'Card',
        numbers: c.numbers,
        due: input.due.get(c.cardId) ?? null,
        paidNext: input.next.get(c.cardId)?.paid === true,
        nextMethod: input.next.get(c.cardId)?.paid
          ? (input.next.get(c.cardId)?.method ?? null)
          : null,
        paper: member?.paper === true,
      }),
    );
  }
  return rows.sort(
    (a, b) => a.displayName.localeCompare(b.displayName) || a.label.localeCompare(b.label),
  );
}

/** "12 of 30 cards paid" for the top of the list. */
export function paidCountText(rows: PaymentRowData[]): string {
  const paid = rows.filter((r) => r.due?.paid).length;
  return `${paid} of ${rows.length} card${rows.length === 1 ? '' : 's'} paid for this draw.`;
}

/** What a payment row says beside the name. */
export function paymentRowText(r: PaymentRowData): string {
  if (r.due?.paid) {
    const how = r.due.method === 'etransfer' ? 'e-Transfer' : 'cash';
    return `Paid, ${how}${r.due.late ? ', after the cutoff' : ''}.`;
  }
  if (r.paidNext) return 'Not paid for this draw. Paid late for the next one.';
  if (r.due?.intent === 'cash') return 'Not paid. Says they’ll pay cash.';
  if (r.due?.intent === 'etransfer')
    return 'Not paid. Says they sent an e-Transfer: check the bank.';
  return 'Not paid.';
}

/** The totals view (D-128): percentages and counts, no names. */
export function totalsText(t: {
  paidCards: number;
  players: number;
  heavyShare: number;
  atCap: number;
}): string {
  if (t.paidCards === 0) return 'Nothing paid yet.';
  return `${t.paidCards} cards from ${t.players} ${t.players === 1 ? 'person' : 'people'}. ${Math.round(t.heavyShare * 100)}% from people with 4 or 5 cards. ${t.atCap} at the most cards allowed.`;
}
