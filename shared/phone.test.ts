import { formatPhone, normalizePhone } from './phone';

describe('North American phone numbers', () => {
  it('accepts Canadian and US numbers in any common format', () => {
    expect(normalizePhone('613-555-0123')).toBe('+16135550123');
    expect(normalizePhone('(315) 555-0199')).toBe('+13155550199'); // New York side
    expect(normalizePhone('1 613 555 0123')).toBe('+16135550123');
    expect(normalizePhone('+1.613.555.0123')).toBe('+16135550123');
  });

  it('rejects numbers that are too short, too long, or not North American', () => {
    expect(normalizePhone('613 555')).toBeNull();
    expect(normalizePhone('44 20 7946 0958')).toBeNull();
    expect(normalizePhone('113-555-0123')).toBeNull(); // area code can't start with 1
    expect(normalizePhone('613-155-0123')).toBeNull(); // exchange can't start with 1
  });

  it('formats for display', () => {
    expect(formatPhone('+16135550123')).toBe('613-555-0123');
  });
});
