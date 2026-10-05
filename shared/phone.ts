/**
 * North American phone numbers (+1), so players on both sides of the border are equal
 * (PERSONAS Border Test, DECISIONS.md D-038). Stored as E.164: "+16135550123".
 */

/** "+16135550123", or null if it isn't a valid North American number. */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  // Area code and exchange can't start with 0 or 1 (NANP).
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  return `+1${digits}`;
}

/** "+16135550123" → "613-555-0123" */
export function formatPhone(e164: string): string {
  const d = e164.replace(/^\+1/, '');
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : e164;
}
