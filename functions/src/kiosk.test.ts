import { describe, expect, it } from 'vitest';
import { comparePin, generateSalt, hashPin } from './kiosk';

describe('kiosk PIN hashing and verification', () => {
  it('hashes and verifies a 4-digit PIN accurately', () => {
    const pin = '4821';
    const salt = generateSalt();
    const hash = hashPin(pin, salt);

    expect(comparePin(pin, salt, hash)).toBe(true);
    expect(comparePin('4822', salt, hash)).toBe(false);
    expect(comparePin('0000', salt, hash)).toBe(false);
  });

  it('generates distinct salts on each call', () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    expect(salt1).not.toBe(salt2);
    expect(salt1.length).toBe(32); // 16 bytes in hex
  });

  it('handles whitespace trimming gracefully', () => {
    const pin = '1234';
    const salt = generateSalt();
    const hash = hashPin(pin, salt);

    expect(comparePin(' 1234 ', salt, hash)).toBe(true);
  });
});
