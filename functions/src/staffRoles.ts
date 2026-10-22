/**
 * Staff roles from the roster (D-140). The commissioner gives a linked player the counter role or
 * admin, or takes it away. The role is a custom claim on the player's login, set here with the
 * Admin SDK, never by the browser (CLAUDE.md §4.7). Auth is a parameter so the tests can stand in
 * for it: the integration tests run against the Firestore emulator only.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import type { SetStaffRoleResult, StaffRolesList } from '../../shared/adminTypes';
import { checkRoleChange, claimsWithRole, staffRoleOf, type RoleChoice } from '../../shared/roles';
import { auditInTransaction } from './audit';

/** The few Auth calls this needs; `getAuth()` from firebase-admin fits it. */
export interface RoleAuth {
  getUser(
    uid: string,
  ): Promise<{ customClaims?: Record<string, unknown>; providerData: unknown[] }>;
  getUsers(
    ids: { uid: string }[],
  ): Promise<{ users: { uid: string; customClaims?: Record<string, unknown> }[] }>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown> | null): Promise<void>;
}

/** `adminListStaffRoles`: who on the roster is a counter or an admin. */
export async function listStaffRoles(db: Firestore, auth: RoleAuth): Promise<StaffRolesList> {
  const linked = (await db.collection('players').get()).docs
    .filter((d) => d.get('claimedByUid') && !d.get('mergedInto'))
    .map((d) => ({ playerId: d.id, uid: String(d.get('claimedByUid')) }));

  const roleByUid = new Map<string, 'admin' | 'counter'>();
  for (let i = 0; i < linked.length; i += 100) {
    const found = await auth.getUsers(linked.slice(i, i + 100).map(({ uid }) => ({ uid })));
    for (const user of found.users) {
      const role = staffRoleOf(user.customClaims);
      if (role) roleByUid.set(user.uid, role);
    }
  }

  const roles: StaffRolesList['roles'] = {};
  for (const { playerId, uid } of linked) {
    const role = roleByUid.get(uid);
    if (role) roles[playerId] = role;
  }
  return { roles };
}

/** `adminSetStaffRole`: make a linked player a counter or an admin, or a plain player again. */
export async function setStaffRole(
  db: Firestore,
  auth: RoleAuth,
  input: { playerId: string; role: RoleChoice; actorUid: string },
): Promise<SetStaffRoleResult> {
  const { playerId, role, actorUid } = input;
  const ref = db.doc(`players/${playerId}`);
  const player = await ref.get();
  if (!player.exists) throw new HttpsError('not-found', 'That player does not exist.');
  const displayName = String(player.get('displayName') ?? 'This player');
  const uid = (player.get('claimedByUid') as string | null | undefined) ?? null;

  let user: Awaited<ReturnType<RoleAuth['getUser']>> | null = null;
  if (uid) {
    try {
      user = await auth.getUser(uid);
    } catch {
      throw new HttpsError(
        'failed-precondition',
        `The login linked to ${displayName} no longer exists. Unlink it, and they can ask to link again.`,
      );
    }
  }

  const check = checkRoleChange({
    displayName,
    uid,
    actorUid,
    merged: Boolean(player.get('mergedInto')),
    savedLogin: Boolean(user && user.providerData.length > 0),
  });
  if (!check.ok) throw new HttpsError('failed-precondition', check.message);

  const before = staffRoleOf(user!.customClaims) ?? 'none';
  if (before === role) return { role, changed: false };

  await auth.setCustomUserClaims(uid!, claimsWithRole(user!.customClaims, role));
  // The claim is on the login, not in the database, so it can't share a transaction with the log.
  // It is set first: a log entry for a change that never happened would be worse than a late one.
  await db.runTransaction(async (tx) => {
    auditInTransaction(tx, db, {
      actorUid,
      action: 'player.role',
      target: ref.path,
      before: { displayName, role: before },
      after: { displayName, role },
    });
  });
  return { role, changed: true };
}
