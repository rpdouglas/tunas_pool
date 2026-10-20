import { describe, expect, it } from 'vitest';
import {
  bannerText,
  drawStep,
  drawStepText,
  paidCountText,
  parseDrawNumbers,
  paymentRowText,
  paymentRows,
  totalsText,
  type StaffPayment,
} from './bingoStaffView';

const paid = (method: 'cash' | 'etransfer', late = false): StaffPayment => ({
  paid: true,
  method,
  late,
  intent: null,
});

describe('bingo for staff, in plain words', () => {
  it('reads six numbers typed any way, and says what is wrong', () => {
    expect(parseDrawNumbers('35 4 5 6 33 34')).toEqual({
      ok: true,
      numbers: [4, 5, 6, 33, 34, 35],
    });
    expect(parseDrawNumbers('4,5,6, 33-34/35')).toEqual({
      ok: true,
      numbers: [4, 5, 6, 33, 34, 35],
    });
    expect(parseDrawNumbers('4 5 6 33 34')).toEqual({
      ok: false,
      message: "Type six numbers. That's 5.",
    });
    expect(parseDrawNumbers('4 5 6 33 34 50').ok).toBe(false);
    expect(parseDrawNumbers('4 4 6 33 34 35')).toEqual({
      ok: false,
      message: 'Each number can only be picked once.',
    });
  });

  it('knows where the draw stands', () => {
    expect(drawStep('upcoming', 10, 20)).toBe('before-cutoff');
    expect(drawStep(null, 20, 20)).toBe('needs-numbers');
    expect(drawStep('upcoming', 30, 20)).toBe('needs-numbers');
    expect(drawStep('proposed', 30, 20)).toBe('waiting-approval');
    expect(drawStepText('waiting-approval', '2026-11-18', [4, 5, 6, 33, 34, 35])).toBe(
      'The Wed, Nov 18 draw is waiting for approval: 4 5 6 33 34 35. Check it against the official result.',
    );
    expect(drawStepText('needs-numbers', '2026-11-18', null)).toMatch(/bonus number doesn't count/);
    expect(bannerText({ drawDate: '2026-11-18' })).toBe(
      'A bingo draw is waiting for approval (Wed, Nov 18).',
    );
    expect(bannerText(null)).toBeNull();
  });

  it('lists every card by name, then card, with what each says', () => {
    const rows = paymentRows({
      cards: [
        { cardId: 'c3', playerId: 'p2', numbers: [1, 2, 3, 4, 5, 6] },
        { cardId: 'c1', playerId: 'p1', numbers: [7, 8, 9, 10, 11, 12] },
        { cardId: 'c2', playerId: 'p2', numbers: [13, 14, 15, 16, 17, 18] },
      ],
      members: new Map([
        ['p1', { displayName: 'Rosalie M.', paper: true }],
        ['p2', { displayName: 'Dale D.', paper: false }],
      ]),
      due: new Map([
        ['c3', paid('cash')],
        ['c1', { paid: false, method: null, late: false, intent: 'etransfer' }],
      ]),
      next: new Map([['c2', paid('cash', true)]]),
    });
    expect(rows.map((r) => [r.displayName, r.label, r.cardId])).toEqual([
      ['Dale D.', 'Card 1 of 2', 'c3'],
      ['Dale D.', 'Card 2 of 2', 'c2'],
      ['Rosalie M.', 'Card', 'c1'],
    ]);
    expect(rows.map(paymentRowText)).toEqual([
      'Paid, cash.',
      'Not paid for this draw. Paid late for the next one.',
      'Not paid. Says they sent an e-Transfer: check the bank.',
    ]);
    expect(rows[2].paper).toBe(true);
    expect(paidCountText(rows)).toBe('1 of 3 cards paid for this draw.');
    expect(paymentRowText({ ...rows[0], due: paid('etransfer', true) })).toBe(
      'Paid, e-Transfer, after the cutoff.',
    );
  });

  it('totals stay totals (D-128)', () => {
    expect(totalsText({ paidCards: 0, players: 0, heavyShare: 0, atCap: 0 })).toBe(
      'Nothing paid yet.',
    );
    expect(totalsText({ paidCards: 98, players: 41, heavyShare: 0.3846, atCap: 6 })).toBe(
      '98 cards from 41 people. 38% from people with 4 or 5 cards. 6 at the most cards allowed.',
    );
  });
});
