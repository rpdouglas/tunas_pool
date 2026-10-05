import { counterEntryCheck, counterPaymentCheck, type CounterEntryInput } from './counterPolicy';
import { staffRoleOf } from './roles';

const refusal = (r: ReturnType<typeof counterPaymentCheck>) => (r.ok ? null : r.message);

describe('staffRoleOf', () => {
  it('reads the two separate claims, and admin wins', () => {
    expect(staffRoleOf({ admin: true })).toBe('admin');
    expect(staffRoleOf({ counter: true })).toBe('counter');
    expect(staffRoleOf({ admin: true, counter: true })).toBe('admin');
  });

  it('is not fooled by anything but a real true', () => {
    expect(staffRoleOf({ admin: 'true' })).toBeNull();
    expect(staffRoleOf({ counter: 1 })).toBeNull();
    expect(staffRoleOf({ role: 'counter' })).toBeNull();
    expect(staffRoleOf(null)).toBeNull();
    expect(staffRoleOf(undefined)).toBeNull();
  });
});

describe('counterPaymentCheck', () => {
  it('lets the counter mark cash received, with or without a method on record', () => {
    expect(counterPaymentCheck(null, { status: 'paid', method: 'cash' })).toEqual({ ok: true });
    expect(
      counterPaymentCheck({ paymentMethod: 'cash', paymentStatus: 'unpaid' }, { status: 'paid' }),
    ).toEqual({ ok: true });
  });

  it('lets the counter take cash from someone who said they would e-Transfer', () => {
    expect(
      counterPaymentCheck(
        { paymentMethod: 'etransfer', paymentStatus: 'unpaid' },
        { status: 'paid', method: 'cash' },
      ),
    ).toEqual({ ok: true });
  });

  it('refuses to mark an e-Transfer paid, said outright or on record', () => {
    expect(refusal(counterPaymentCheck(null, { status: 'paid', method: 'etransfer' }))).toContain(
      'Ask the commissioner.',
    );
    expect(
      refusal(
        counterPaymentCheck(
          { paymentMethod: 'etransfer', paymentStatus: 'unpaid' },
          { status: 'paid' },
        ),
      ),
    ).toContain('confirmed by the commissioner');
  });

  it('lets the counter undo a cash payment, and refuses to undo an e-Transfer one', () => {
    expect(
      counterPaymentCheck({ paymentMethod: 'cash', paymentStatus: 'paid' }, { status: 'unpaid' }),
    ).toEqual({ ok: true });
    expect(
      refusal(
        counterPaymentCheck(
          { paymentMethod: 'etransfer', paymentStatus: 'paid' },
          { status: 'unpaid' },
        ),
      ),
    ).toContain('undo an e-Transfer payment');
  });

  it('lets an undo of nothing through, since the server treats it as no change', () => {
    expect(counterPaymentCheck(null, { status: 'unpaid' })).toEqual({ ok: true });
    expect(
      counterPaymentCheck(
        { paymentMethod: 'etransfer', paymentStatus: 'unpaid' },
        { status: 'unpaid' },
      ),
    ).toEqual({ ok: true });
  });
});

describe('counterEntryCheck', () => {
  const ok: CounterEntryInput = {
    windowMode: 'open',
    playerName: 'Rosalie M.',
    playerActive: true,
    entryExists: false,
    markPaid: 'cash',
  };
  const why = (over: Partial<CounterEntryInput>) => {
    const r = counterEntryCheck({ ...ok, ...over });
    return r.ok ? null : r.message;
  };

  it('allows a new sheet while the week is open, with cash marked paid or nothing', () => {
    expect(counterEntryCheck(ok)).toEqual({ ok: true });
    expect(counterEntryCheck({ ...ok, markPaid: null })).toEqual({ ok: true });
  });

  it('sends everything after the lock to the commissioner', () => {
    expect(why({ windowMode: 'late' })).toContain('locked');
    expect(why({ windowMode: 'late' })).toContain('Ask the commissioner.');
    expect(why({ windowMode: 'backfill' })).toContain('needs the commissioner');
    expect(why({ windowMode: 'closed' })).toContain('closed');
  });

  it('sends a change to a sheet that is already in to the commissioner', () => {
    expect(why({ entryExists: true })).toBe(
      "Rosalie M.'s sheet is already in. To change it, ask the commissioner.",
    );
  });

  it('sends an inactive player and an e-Transfer to the commissioner', () => {
    expect(why({ playerActive: false })).toBe(
      'Rosalie M. is marked inactive. Ask the commissioner.',
    );
    expect(why({ markPaid: 'etransfer' })).toContain('e-Transfer');
  });

  it('checks the week first, so the first thing Devon hears is the real blocker', () => {
    expect(why({ windowMode: 'late', entryExists: true, playerActive: false })).toContain('locked');
  });
});
