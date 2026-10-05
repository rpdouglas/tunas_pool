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
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FUNCTIONS_REGION } from '../../shared/config';

initializeApp();
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
  throw new HttpsError('unimplemented', `${name} is not implemented yet (see docs/PROJECT_PLAN.md).`);
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
export const adminSetWeekStatus = adminStub('adminSetWeekStatus');
export const adminEnterResults = adminStub('adminEnterResults');
export const adminPublishWinner = adminStub('adminPublishWinner');
export const adminMarkPayout = adminStub('adminMarkPayout');
export const adminListClaims = adminStub('adminListClaims');
export const adminApproveClaim = adminStub('adminApproveClaim');
export const adminRejectClaim = adminStub('adminRejectClaim');
export const adminUnlinkClaim = adminStub('adminUnlinkClaim');
export const adminMergePlayers = adminStub('adminMergePlayers');
export const getDuplicateFlags = adminStub('getDuplicateFlags');

// ---- Player callable (Sprint 5) ---------------------------------------------
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
