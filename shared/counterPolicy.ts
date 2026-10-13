/**
 * What the counter role may do with money and entries (D-095). The commissioner can do all of
 * this and more; these are the limits for Devon. Pure, so every case is unit tested, and the server
 * applies the same checks inside its transactions. Each refusal says what to do next (PERSONAS:
 * Devon, "Blocked actions say what to do").
 */
import type { PaymentMethod, PaymentStatus } from './types';

export const ASK_COMMISSIONER = 'Ask the commissioner.';

export type Refusal = { ok: false; message: string };
export type Allowed = { ok: true };

/**
 * Marking cash received, and undoing a cash payment, are the counter's. e-Transfers are confirmed
 * against the bank, which only the commissioner can see, so the counter neither marks nor undoes one.
 */
export function counterPaymentCheck(
  existing: { paymentMethod: PaymentMethod; paymentStatus: PaymentStatus } | null,
  request: { status: PaymentStatus; method?: PaymentMethod | null },
): Allowed | Refusal {
  if (request.status === 'paid') {
    const method = request.method ?? existing?.paymentMethod;
    if (method === 'etransfer') {
      return {
        ok: false,
        message: `e-Transfer payments are confirmed by the commissioner. ${ASK_COMMISSIONER}`,
      };
    }
    return { ok: true };
  }
  // Undo: only for a payment that was cash. Nothing to undo is fine (the server treats it as no change).
  if (existing?.paymentStatus === 'paid' && existing.paymentMethod === 'etransfer') {
    return {
      ok: false,
      message: `Only the commissioner can undo an e-Transfer payment. ${ASK_COMMISSIONER}`,
    };
  }
  return { ok: true };
}

export type WindowMode = 'open' | 'late' | 'backfill' | 'closed';

/**
 * Entering picks at the counter: a new sheet, while the week is open, for someone who is active,
 * with at most cash marked paid. Changing a sheet that is already in, anything after the lock, and
 * backfilling a past week stay with the commissioner.
 */
export interface CounterEntryInput {
  windowMode: WindowMode;
  playerName: string;
  playerActive: boolean;
  entryExists: boolean;
  markPaid: PaymentMethod | null | undefined;
}

export function counterEntryCheck(input: CounterEntryInput): Allowed | Refusal {
  if (input.windowMode === 'closed') {
    return {
      ok: false,
      message: `Entries for this week are closed. ${ASK_COMMISSIONER}`,
    };
  }
  if (input.windowMode !== 'open') {
    return {
      ok: false,
      message: `Picks are locked, so a new entry now needs the commissioner. ${ASK_COMMISSIONER}`,
    };
  }
  if (!input.playerActive) {
    return { ok: false, message: `${input.playerName} is marked inactive. ${ASK_COMMISSIONER}` };
  }
  if (input.entryExists) {
    return {
      ok: false,
      message: `${input.playerName}'s sheet is already in. To change it, ${ASK_COMMISSIONER.toLowerCase()}`,
    };
  }
  if (input.markPaid === 'etransfer') {
    return {
      ok: false,
      message: `e-Transfer payments are confirmed by the commissioner. ${ASK_COMMISSIONER}`,
    };
  }
  return { ok: true };
}
