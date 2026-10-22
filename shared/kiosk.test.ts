import { describe, expect, it } from 'vitest';
import { isValidPin } from './kiosk';

describe('kiosk validation', () => {
  it('accepts valid 4-digit PINs', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('0000')).toBe(true);
    expect(isValidPin('9999')).toBe(true);
    expect(isValidPin(' 1234 ')).toBe(true);
  });

  it('rejects invalid PIN formats', () => {
    expect(isValidPin('')).toBe(false);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('12345')).toBe(false);
    expect(isValidPin('abcd')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin('12 4')).toBe(false);
  });
});
