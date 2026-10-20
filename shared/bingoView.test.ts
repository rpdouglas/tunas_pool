import { describe, expect, it } from 'vitest';
import {
  boardLines,
  dollars,
  drawDay,
  hitsInWords,
  joinWindowText,
  limitText,
  oddsLines,
  paidWeeksText,
  paymentText,
  spendText,
} from './bingoView';

const limits = { limit: 3, pendingLimit: null, pendingFromCycle: null, pausedThroughCycle: null };

describe('bingo in plain words', () => {
  it('money in dollars, with thousands', () => {
    expect([dollars(1000), dollars(208_000), dollars(2050), dollars(0)]).toEqual([
      '$10',
      '$2,080',
      '$20.50',
      '$0',
    ]);
  });

  it('draw days', () => {
    expect(drawDay('2026-11-18')).toBe('Wed, Nov 18');
  });

  it('crossed-off numbers, in words', () => {
    expect(hitsInWords([])).toBe('Nothing crossed off yet.');
    expect(hitsInWords([11])).toBe('1 of 6 crossed off: 11.');
    expect(hitsInWords([3, 11, 27])).toBe('3 of 6 crossed off: 3, 11 and 27.');
    expect(hitsInWords([1, 2, 3, 4, 5, 6])).toBe('All 6 crossed off: 1, 2, 3, 4, 5 and 6.');
  });

  it('paid weeks and this week’s payment', () => {
    expect(paidWeeksText(0, 0)).toBe('No draws yet this game.');
    expect(paidWeeksText(2, 3)).toBe('Paid for 2 of 3 draws so far.');
    expect(paidWeeksText(1, 1)).toBe('Paid for 1 of 1 draw so far.');
    expect(paymentText('2026-11-18', { paid: true, late: false, intent: null })).toBe(
      'Paid for Wed, Nov 18.',
    );
    expect(paymentText('2026-11-18', null)).toMatch(/Pay by 6 PM Wednesday/);
    expect(paymentText('2026-11-18', { paid: false, late: false, intent: 'cash' })).toMatch(
      /pay cash at the shop/,
    );
    expect(paymentText('2026-11-18', { paid: false, late: false, intent: 'etransfer' })).toMatch(
      /once it's checked/,
    );
  });

  it('limits, a waiting raise, and a pause', () => {
    expect(limitText(limits, 2, 5)).toEqual(['Your limit: 3 cards a draw.']);
    expect(limitText({ ...limits, limit: 1 }, 2, 5)).toEqual(['Your limit: 1 card a draw.']);
    expect(limitText({ ...limits, pendingLimit: 5, pendingFromCycle: 3 }, 2, 5)).toEqual([
      'Your limit: 3 cards a draw.',
      'Going up to 5 from the next game. A raise always waits a game.',
    ]);
    expect(limitText({ ...limits, pausedThroughCycle: 2 }, 2, 5)).toEqual([
      'You are sitting out this game.',
    ]);
    expect(limitText({ ...limits, pausedThroughCycle: 4 }, 2, 5)).toEqual([
      'You are sitting out this game and the next 2.',
    ]);
    expect(limitText({ ...limits, pausedThroughCycle: 1 }, 2, 5)).toEqual([
      'Your limit: 3 cards a draw.',
    ]);
  });

  it('spend, the board, and the join window', () => {
    expect(spendText(3000, 12_000, '2026')).toBe("You've put in $30 this game and $120 in 2026.");
    expect(boardLines({ at3: 4, at4: 1, at5: 0, cards: 64 })).toEqual([
      '64 cards in this game.',
      '4 cards with 3 crossed off, 1 card with 4, 0 cards with 5.',
    ]);
    expect(joinWindowText(true, '2026-11-25')).toBe(
      'New cards can be added until 6 PM Wed, Nov 25, the first draw of this game.',
    );
    expect(joinWindowText(false, '2026-11-25')).toMatch(/when this game is won/);
  });

  it('the odds come from the game’s own settings, and never promise a win', () => {
    const lines = oddsLines({ priceCents: 1000, operatorPct: 40, maxWeeks: 26 });
    expect(lines[0]).toBe('A card is $10 a draw.');
    expect(lines[1]).toBe('40% of every dollar goes to the house. 60% goes into the pot.');
    expect(lines[2]).toMatch(/about 60¢ of every dollar/);
    expect(lines.join(' ')).toMatch(/Most cards get back nothing/);
    expect(oddsLines({ priceCents: 2000, operatorPct: 30, maxWeeks: 12 }).join(' ')).toMatch(
      /\$20 a draw.*70¢.*12 weeks/,
    );
  });

  it('never says a card is close (the Bingo Check)', () => {
    const all = [
      hitsInWords([1, 2, 3, 4, 5]),
      ...boardLines({ at3: 1, at4: 1, at5: 1, cards: 3 }),
      ...oddsLines({ priceCents: 1000, operatorPct: 40, maxWeeks: 26 }),
    ].join(' ');
    expect(all).not.toMatch(/close|almost|so near|one away|just one/i);
  });
});
