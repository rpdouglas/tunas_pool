/**
 * Cloud Functions entry. Contracts live in docs/DATA_MODEL.md §5.
 * Every function below is a STUB that enforces auth and then throws "unimplemented".
 * Implement them in the sprint noted in docs/PROJECT_PLAN.md. Admin-sensitive writes must
 * also write auditLog (CLAUDE.md principle 5).
 * Shared types: import type { ... } from '../../shared/types'
 * Firestore: always getFirestore(FIRESTORE_DATABASE_ID) from '../../shared/config', never the
 * bare getFirestore(). Firestore triggers must also set `database: FIRESTORE_DATABASE_ID`.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Transaction } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FIRESTORE_DATABASE_ID, FUNCTIONS_REGION } from '../../shared/config';
import type { AuditAction, Game, WeekStatus } from '../../shared/types';
import { planGuestMove } from './guestMove';
import { planStatusChange, toGameDraft } from './weekStatus';

const app = initializeApp();
const db = getFirestore(app, FIRESTORE_DATABASE_ID);
setGlobalOptions({ region: FUNCTIONS_REGION, maxInstances: 10 });

function requireAdmin(req: CallableRequest): void {
  if (req.auth?.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }
}

function requireSignedIn(req: CallableRequest): void {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }
}

function notImplemented(name: string): never {
  throw new HttpsError(
    'unimplemented',
    `${name} is not implemented yet (see docs/PROJECT_PLAN.md).`,
  );
}

function writeAudit(
  tx: Transaction,
  entry: {
    actorUid: string;
    action: AuditAction;
    target: string;
    before: unknown;
    after: unknown;
    reason?: string;
    year?: string;
    weekId?: string;
  },
): void {
  tx.create(db.collection('auditLog').doc(), { at: FieldValue.serverTimestamp(), ...entry });
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function requireId(value: unknown, name: string): string {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    throw new HttpsError('invalid-argument', `${name} is missing or not valid.`);
  }
  return value;
}

const adminStub = (name: string) =>
  onCall(async (req) => {
    requireAdmin(req);
    return notImplemented(name);
  });

// ---- Admin callables (Sprints 1-5) ------------------------------------------
export const adminSetPayment = adminStub('adminSetPayment');
export const adminUpsertEntry = adminStub('adminUpsertEntry');
export const adminLateOverride = adminStub('adminLateOverride');
export const adminDeleteEntry = adminStub('adminDeleteEntry');
export const adminEnterResults = adminStub('adminEnterResults');
export const adminPublishWinner = adminStub('adminPublishWinner');
export const adminMarkPayout = adminStub('adminMarkPayout');
export const adminListClaims = adminStub('adminListClaims');
export const adminApproveClaim = adminStub('adminApproveClaim');
export const adminRejectClaim = adminStub('adminRejectClaim');
export const adminUnlinkClaim = adminStub('adminUnlinkClaim');
export const adminMergePlayers = adminStub('adminMergePlayers');
export const getDuplicateFlags = adminStub('getDuplicateFlags');

// ---- adminSetWeekStatus (Sprint 1): draft -> open, open -> draft, open -> locked ----
export const adminSetWeekStatus = onCall(async (req) => {
  requireAdmin(req);
  const year = requireId(req.data?.year, 'year');
  const weekId = requireId(req.data?.weekId, 'weekId');
  const to = req.data?.status as WeekStatus;
  if (!['draft', 'open', 'locked'].includes(to)) {
    throw new HttpsError('invalid-argument', 'status must be draft, open, or locked.');
  }

  const weekRef = db.doc(`seasons/${year}/weeks/${weekId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(weekRef);
    if (!snap.exists) throw new HttpsError('not-found', 'That week does not exist.');
    const week = snap.data()!;
    const entries = await tx.get(weekRef.collection('entries').limit(1));
    const plan = planStatusChange(
      {
        status: week.status,
        lockAtMs: week.lockAt.toMillis(),
        games: (week.games as Game[]).map(toGameDraft),
        mnfGameId: week.mnfGameId,
      },
      to,
      Date.now(), // the server clock decides (CLAUDE.md §4.4)
      entries.size,
    );
    if (!plan.ok) throw new HttpsError(plan.code, plan.message);

    tx.update(weekRef, { ...plan.update, updatedAt: FieldValue.serverTimestamp() });
    writeAudit(tx, {
      actorUid: req.auth!.uid,
      action: 'week.status',
      target: weekRef.path,
      before: { status: week.status, revealed: week.revealed },
      after: { revealed: week.revealed, ...plan.update },
      year,
      weekId,
    });
    return plan.update;
  });
});

// ---- Player callables ---------------------------------------------------------

/**
 * adoptGuestProfile (Sprint 1). A guest tried to save their account with an email that already has
 * an account, so the app signed them in to that account instead. The guest's profile (and with it,
 * every entry) moves to the account by changing `claimedByUid`. The guest proves who they were with
 * the ID token captured before switching accounts.
 */
export const adoptGuestProfile = onCall(async (req) => {
  requireSignedIn(req);
  const guestIdToken = req.data?.guestIdToken;
  if (typeof guestIdToken !== 'string')
    throw new HttpsError('invalid-argument', 'guestIdToken is required.');

  let guestUid: string;
  try {
    const decoded = await getAuth(app).verifyIdToken(guestIdToken);
    if (decoded.firebase.sign_in_provider !== 'anonymous') {
      throw new HttpsError('permission-denied', 'Only a guest login can be moved.');
    }
    guestUid = decoded.uid;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('permission-denied', 'That guest session has expired.');
  }

  const callerUid = req.auth!.uid;
  const guestRef = db.doc(`players/${guestUid}`);
  return db.runTransaction(async (tx) => {
    const guestSnap = await tx.get(guestRef);
    const callerProfiles = await tx.get(
      db.collection('players').where('claimedByUid', '==', callerUid).limit(1),
    );
    const plan = planGuestMove({
      guestUid,
      guestProfile: guestSnap.exists
        ? { claimedByUid: guestSnap.get('claimedByUid') ?? null }
        : null,
      callerUid,
      callerProfileIds: callerProfiles.docs.map((d) => d.id),
    });
    if (plan.action === 'relink') {
      tx.update(guestRef, { claimedByUid: callerUid, updatedAt: FieldValue.serverTimestamp() });
      writeAudit(tx, {
        actorUid: callerUid,
        action: 'player.guestMoved',
        target: guestRef.path,
        before: { claimedByUid: guestUid },
        after: { claimedByUid: callerUid },
      });
    }
    return plan;
  });
});

export const requestClaim = onCall(async (req) => {
  requireSignedIn(req);
  return notImplemented('requestClaim');
});

// ---- Scheduled (Sprint 3): at lockAt set status='locked' and revealed=true ----
export const lockWeeks = onSchedule(
  { schedule: 'every 1 minutes', timeZone: 'America/Toronto' },
  async () => {
    // TODO(Sprint 3): find open weeks where lockAt <= now, lock them, set revealed=true,
    // and write an auditLog entry. Consider a slower cadence outside Saturday night.
  },
);
