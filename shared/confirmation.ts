/**
 * Entry confirmation code (DATA_MODEL.md §10, DECISIONS.md D-026). Derived, never stored: six
 * characters from a hash of the season, week, player, and the server's submission time, so it
 * changes on every edit. A reference for conversations, not a security token.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
export const CONFIRMATION_CODE_LENGTH = 6;

/** 32-bit FNV-1a. Small, deterministic, and the same in the browser and on the server. */
function fnv1a(text: string, seed = 0x811c9dc5): number {
  let hash = seed;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function confirmationCode(input: {
  year: string;
  weekId: string;
  playerId: string;
  picksSubmittedAtMs: number;
}): string {
  const key = `${input.year}|${input.weekId}|${input.playerId}|${input.picksSubmittedAtMs}`;
  // Two independent hashes give 64 bits, plenty for six characters from 31 symbols.
  let value = (BigInt(fnv1a(key)) << 32n) | BigInt(fnv1a(key, 0x9e3779b9));
  const base = BigInt(ALPHABET.length);
  let code = '';
  for (let i = 0; i < CONFIRMATION_CODE_LENGTH; i++) {
    code += ALPHABET[Number(value % base)];
    value /= base;
  }
  return code;
}
