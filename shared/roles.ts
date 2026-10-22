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

/** What the roster's role switch can set (D-140): a staff role, or back to a plain player. */
export type RoleChoice = StaffRole | 'none';

export const ROLE_CHOICES: RoleChoice[] = ['none', 'counter', 'admin'];

export const ROLE_LABELS: Record<RoleChoice, string> = {
  none: 'Player',
  counter: 'Counter',
  admin: 'Admin',
};

export function parseRoleChoice(value: unknown): RoleChoice | null {
  return typeof value === 'string' && (ROLE_CHOICES as string[]).includes(value)
    ? (value as RoleChoice)
    : null;
}

/**
 * The login's claims with the new role in place of the old one. Every other claim is kept: the
 * Firebase project is shared with other apps (D-015), and their claims are not ours to drop.
 */
export function claimsWithRole(
  claims: Record<string, unknown> | null | undefined,
  role: RoleChoice,
): Record<string, unknown> {
  const others = { ...claims };
  delete others.admin;
  delete others.counter;
  return role === 'none' ? others : { ...others, [role]: true };
}

export interface RoleChangeFacts {
  displayName: string;
  /** The login linked to the profile, or null when none is. */
  uid: string | null;
  /** Who is asking. */
  actorUid: string;
  merged: boolean;
  /** Signed in with Google or an email link, not only as a guest. */
  savedLogin: boolean;
}

/**
 * Can this player be given a role (D-140)? Only a profile with a saved login, and never your own:
 * that is also what keeps the pool from losing its last admin, since whoever asks is an admin and
 * stays one. Each refusal is a sentence the screen shows as it is.
 */
export function checkRoleChange(
  facts: RoleChangeFacts,
): { ok: true } | { ok: false; message: string } {
  const name = facts.displayName;
  if (facts.merged) return { ok: false, message: `${name} was merged into another player.` };
  if (!facts.uid) {
    return {
      ok: false,
      message: `${name} isn't linked to a login yet. They sign in on the website and ask to link their profile first.`,
    };
  }
  if (facts.uid === facts.actorUid) {
    return { ok: false, message: "You can't change your own role." };
  }
  if (!facts.savedLogin) {
    return {
      ok: false,
      message: `${name} is signed in as a guest. Ask them to save their account (Google or an email link) first, so the role can't be lost with their browser.`,
    };
  }
  return { ok: true };
}
