/**
 * Pure planning for `adminSetPayment`. Kept apart from Firestore so every case is unit tested.
 * An entry's payment lives in entries/{playerId}/payment/current (DECISIONS.md D-036). It can be
 * missing: payment never blocks an entry, so a player may not have said how they'll pay yet.
 */
import type { PaymentIntent, PaymentMethod, PaymentStatus } from '../../shared/types';

export interface PaymentSnapshot {
  paymentMethod: PaymentMethod;
  paymentIntent: PaymentIntent;
  paymentStatus: PaymentStatus;
}

export type PaymentPlan =
  | { kind: 'noop' }
  | { kind: 'error'; message: string }
  | {
      kind: 'write';
      mode: 'create' | 'update';
      status: PaymentStatus;
      method: PaymentMethod;
      intent: PaymentIntent;
      before: PaymentSnapshot | null;
      after: PaymentSnapshot;
    };

export function planPaymentChange(
  existing: PaymentSnapshot | null,
  request: { status: PaymentStatus; method?: PaymentMethod },
): PaymentPlan {
  const { status, method } = request;

  if (!existing) {
    if (status === 'unpaid') return { kind: 'noop' }; // nothing was marked paid, so nothing to undo
    if (!method) {
      return {
        kind: 'error',
        message: "This player hasn't said how they'll pay. Choose cash or e-Transfer.",
      };
    }
    const after: PaymentSnapshot = {
      paymentMethod: method,
      paymentIntent: 'already_did',
      paymentStatus: 'paid',
    };
    return {
      kind: 'write',
      mode: 'create',
      status,
      method,
      intent: 'already_did',
      before: null,
      after,
    };
  }

  const nextMethod = method ?? existing.paymentMethod;
  // Handing over the money settles "will do": it has been done.
  const nextIntent: PaymentIntent = status === 'paid' ? 'already_did' : existing.paymentIntent;
  if (existing.paymentStatus === status && nextMethod === existing.paymentMethod)
    return { kind: 'noop' };

  return {
    kind: 'write',
    mode: 'update',
    status,
    method: nextMethod,
    intent: nextIntent,
    before: existing,
    after: { paymentMethod: nextMethod, paymentIntent: nextIntent, paymentStatus: status },
  };
}

export type PaymentRequest =
  { ok: true; status: PaymentStatus; method?: PaymentMethod } | { ok: false; message: string };

/**
 * Reads the callable's input. The Firebase client sends an omitted field as null, so a missing
 * `method` arrives as null and means the same as undefined.
 */
export function parsePaymentRequest(data: unknown): PaymentRequest {
  const input = (data ?? {}) as { status?: unknown; method?: unknown };
  if (input.status !== 'paid' && input.status !== 'unpaid') {
    return { ok: false, message: 'status must be paid or unpaid.' };
  }
  const method = input.method ?? undefined;
  if (method !== undefined && method !== 'cash' && method !== 'etransfer') {
    return { ok: false, message: 'method must be cash or etransfer.' };
  }
  return { ok: true, status: input.status, method };
}
