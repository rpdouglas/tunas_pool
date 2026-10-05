import { describe, expect, it } from 'vitest';
import { parsePaymentRequest, planPaymentChange, type PaymentSnapshot } from './payments';

const declared: PaymentSnapshot = {
  paymentMethod: 'etransfer',
  paymentIntent: 'will_do',
  paymentStatus: 'unpaid',
};

describe('planPaymentChange', () => {
  it('marks a declared entry paid, and settles "will do" as done', () => {
    const plan = planPaymentChange(declared, { status: 'paid' });
    expect(plan).toMatchObject({
      kind: 'write',
      mode: 'update',
      status: 'paid',
      method: 'etransfer',
      intent: 'already_did',
      before: declared,
      after: { paymentMethod: 'etransfer', paymentIntent: 'already_did', paymentStatus: 'paid' },
    });
  });

  it('undoes a payment, leaving what the player declared alone', () => {
    const paid: PaymentSnapshot = {
      ...declared,
      paymentIntent: 'already_did',
      paymentStatus: 'paid',
    };
    expect(planPaymentChange(paid, { status: 'unpaid' })).toMatchObject({
      kind: 'write',
      status: 'unpaid',
      after: { paymentMethod: 'etransfer', paymentIntent: 'already_did', paymentStatus: 'unpaid' },
    });
  });

  it('does nothing when the entry is already in the requested state (a double tap)', () => {
    expect(planPaymentChange(declared, { status: 'unpaid' })).toEqual({ kind: 'noop' });
    const paid: PaymentSnapshot = { ...declared, paymentStatus: 'paid' };
    expect(planPaymentChange(paid, { status: 'paid' })).toEqual({ kind: 'noop' });
  });

  it('lets the admin record how it was really paid (they said e-Transfer but handed over cash)', () => {
    expect(planPaymentChange(declared, { status: 'paid', method: 'cash' })).toMatchObject({
      kind: 'write',
      method: 'cash',
      after: { paymentMethod: 'cash', paymentStatus: 'paid' },
    });
  });

  it('an entry with no payment yet needs a method to be marked paid, then is created as paid', () => {
    expect(planPaymentChange(null, { status: 'paid' })).toMatchObject({ kind: 'error' });
    expect(planPaymentChange(null, { status: 'paid', method: 'cash' })).toMatchObject({
      kind: 'write',
      mode: 'create',
      before: null,
      after: { paymentMethod: 'cash', paymentIntent: 'already_did', paymentStatus: 'paid' },
    });
  });

  it('has nothing to undo for an entry that never had a payment', () => {
    expect(planPaymentChange(null, { status: 'unpaid' })).toEqual({ kind: 'noop' });
  });
});

describe('parsePaymentRequest', () => {
  it('reads a status with or without a method', () => {
    expect(parsePaymentRequest({ status: 'paid' })).toEqual({
      ok: true,
      status: 'paid',
      method: undefined,
    });
    expect(parsePaymentRequest({ status: 'unpaid', method: 'cash' })).toEqual({
      ok: true,
      status: 'unpaid',
      method: 'cash',
    });
  });

  it('treats a null method as not given, because the browser sends omitted fields as null', () => {
    expect(parsePaymentRequest({ status: 'paid', method: null })).toEqual({
      ok: true,
      status: 'paid',
      method: undefined,
    });
  });

  it('rejects an unknown status or method', () => {
    expect(parsePaymentRequest({ status: 'maybe' })).toMatchObject({ ok: false });
    expect(parsePaymentRequest({ status: 'paid', method: 'bitcoin' })).toMatchObject({ ok: false });
    expect(parsePaymentRequest(undefined)).toMatchObject({ ok: false });
  });
});
