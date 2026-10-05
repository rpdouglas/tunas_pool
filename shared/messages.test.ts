import { describe, expect, it } from 'vitest';
import {
  entryReminder,
  groupReminder,
  paymentReminder,
  picksInMessage,
  sharePoolMessage,
  smsLink,
} from './messages';

// Saturday Oct 10, 2026, 11:59 PM in Toronto.
const WEEK = { weekNumber: 5, lockAtMs: Date.UTC(2026, 9, 11, 3, 59), entryFeeCents: 2000 };

describe('reminder messages', () => {
  it('greets by first name and says when picks lock and where to make them', () => {
    const text = entryReminder('Rosalie M.', WEEK);
    expect(text).toMatch(/^Hi Rosalie, it's the Tunas pool\. Week 5 picks lock Saturday/);
    expect(text).toContain('11:59 PM');
    expect(text).toContain('https://tunaspool.web.app');
    expect(text).toContain('drop your sheet at the shop'); // paper is first-class
  });

  it('names nobody in the group message', () => {
    const text = groupReminder(WEEK);
    expect(text).toContain('week 5 picks lock Saturday');
    expect(text).toContain('$20 to enter');
    expect(text).not.toMatch(/Hi /);
  });

  it('keeps the payment message neutral, with both ways to pay and a way out', () => {
    const text = paymentReminder('Troy T.', WEEK, 'pay@tunas.test');
    expect(text).toMatch(/^Hi Troy/);
    expect(text).toContain("I don't have your $20 marked yet");
    expect(text).toContain('cash at the shop');
    expect(text).toContain('e-Transfer to pay@tunas.test');
    expect(text).toContain("If you've already paid, just let me know");
    expect(text).not.toMatch(/owe|late|overdue|unpaid|must|tab/i);
  });

  it('falls back to a plain greeting for an empty name', () => {
    expect(entryReminder('  ', WEEK)).toMatch(/^Hi there,/);
  });
});

describe('share messages', () => {
  it('says a player is in, without a single pick, phone, or payment', () => {
    const text = picksInMessage('Kayla', WEEK);
    expect(text).toBe(
      'Kayla is in for week 5 of the Tunas pool. Picks lock Saturday, Oct 10, 11:59 PM. Get yours in: https://tunaspool.web.app',
    );
    expect(text).not.toMatch(/paid|\$|picked|over /i);
  });

  it('invites people to the pool, with or without an open week', () => {
    expect(sharePoolMessage(WEEK)).toContain('$20 a week, and week 5 picks lock Saturday');
    expect(sharePoolMessage(null)).toMatch(/takes the pot\. https:\/\/tunaspool\.web\.app$/);
  });
});

describe('smsLink', () => {
  it('opens the text app with the number and the message, encoded', () => {
    expect(smsLink('+16135550144', 'Hi Rosalie, picks lock & more')).toBe(
      'sms:+16135550144?&body=Hi%20Rosalie%2C%20picks%20lock%20%26%20more',
    );
  });
});
