/**
 * Who is staff (D-095). `admin` is the commissioner and can do everything. `counter` is Devon, the
 * person who covers the shop counter: daily work only, never the irreversible work. They are two
 * separate custom claims, so every existing check for `admin` still means only the commissioner.
 * The same helper reads a decoded token on the server and the ID token claims in the browser.
 */
export type StaffRole = 'admin' | 'counter';

export function staffRoleOf(claims: Record<string, unknown> | null | undefined): StaffRole | null {
  if (claims?.admin === true) return 'admin';
  if (claims?.counter === true) return 'counter';
  return null;
}
