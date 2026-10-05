/**
 * Cloud Functions entry. Contracts live in docs/DATA_MODEL.md §5.
 * Handlers here only check who is calling and validate the input; the decisions live in small
 * modules next to this file that take the database as a parameter, so they are unit tested and
 * run against the emulator in tests/functions. Every write that matters also writes auditLog
 * (CLAUDE.md principle 5).
 * Shared types and scoring: import from '../../shared/...'
 * Firestore: always getFirestore(FIRESTORE_DATABASE_ID) from '../../shared/config', never the
 * bare getFirestore(). Firestore triggers must also set `database: FIRESTORE_DATABASE_ID`.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FIRESTORE_DATABASE_ID, FUNCTIONS_REGION } from '../../shared/config';
import type { Game, WeekStatus } from '../../shared/types';
import { deleteEntry, upsertEntry } from './adminEntries';
import { deletePlayer, inspectPlayerDelete } from './players';
import { createRateLimit, tidyClientError } from './clientErrors';
import { auditInTransaction } from './audit';
import {
  approveClaim,
  listClaims,
  mergePlayers,
  rejectClaim,
  requestClaim as requestClaimFor,
  unlinkClaim,
} from './claims';
import { writeEntryRecords } from './evaluate';
import { listEntries } from './entriesList';
import { planGuestMove } from './guestMove';
import { lockDueWeeks } from './lockWeeks';
import { parsePaymentRequest } from './payments';
import { sameResults } from './results';
import { recomputeAllTime, recomputeStandings, seasonReport } from './season';
import { isSeasonArchived, listSeasons, setSeasonStatus } from './seasons';
import { recountWeek } from './weekCounters';
import {
  correctResults,
  enterResults,
  markPayout,
  previewWinner,
  publishWinner,
  setPayment,
} from './weekActions';
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

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function requireId(value: unknown, name: string): string {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    throw new HttpsError('invalid-argument', `${name} is missing or not valid.`);
  }
  return value;
}

const weekPath = (year: string, weekId: string) => `seasons/${year}/weeks/${weekId}`;

/** Which of these logins are saved accounts (email link, Google) rather than guest logins. */
async function savedLogins(uids: string[]): Promise<Set<string>> {
  const saved = new Set<string>();
  for (let i = 0; i < uids.length; i += 100) {
    const found = await getAuth(app).getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
    for (const user of found.users) if (user.providerData.length > 0) saved.add(user.uid);
  }
  return saved;
}

/**
 * Bring the standings and all-time stats up to date after something that changes them. It runs
 * after the action it follows has already been saved and audited, so a failure here is logged, not
 * thrown: the commissioner can run it again from the Reports screen.
 */
async function refreshStandings(years: string[] | 'all'): Promise<void> {
  try {
    const list =
      years === 'all'
        ? (await db.collection('seasons').select().get()).docs.map((d) => d.id)
        : years;
    for (const year of list) await recomputeStandings(db, year, savedLogins);
    await recomputeAllTime(db);
  } catch (err) {
    logger.error('standings refresh failed', { years, err });
  }
}

// ---- Claims and merges (Sprint 5) ---------------------------------------------
export const adminListClaims = onCall(async (req) => {
  requireAdmin(req);
  return listClaims(db);
});

export const adminApproveClaim = onCall(async (req) => {
  requireAdmin(req);
  const result = await approveClaim(db, {
    claimId: requireId(req.data?.claimId, 'claimId'),
    playerId: requireId(req.data?.playerId, 'playerId'),
    actorUid: req.auth!.uid,
  });
  await refreshStandings('all');
  return result;
});

export const adminRejectClaim = onCall(async (req) => {
  requireAdmin(req);
  return rejectClaim(db, {
    claimId: requireId(req.data?.claimId, 'claimId'),
    note: req.data?.note,
    actorUid: req.auth!.uid,
  });
});

export const adminUnlinkClaim = onCall(async (req) => {
  requireAdmin(req);
  const result = await unlinkClaim(db, {
    playerId: requireId(req.data?.playerId, 'playerId'),
    actorUid: req.auth!.uid,
  });
  await refreshStandings('all');
  return result;
});

export const adminMergePlayers = onCall(async (req) => {
  requireAdmin(req);
  const result = await mergePlayers(db, {
    fromId: requireId(req.data?.fromId, 'fromId'),
    intoId: requireId(req.data?.intoId, 'intoId'),
    actorUid: req.auth!.uid,
  });
  await refreshStandings('all');
  return result;
});

// ---- adminSetWeekStatus (Sprint 1): draft -> open, open -> draft, open -> locked ----
export const adminSetWeekStatus = onCall(async (req) => {
  requireAdmin(req);
  const year = requireId(req.data?.year, 'year');
  const weekId = requireId(req.data?.weekId, 'weekId');
  const to = req.data?.status as WeekStatus;
  if (!['draft', 'open', 'locked'].includes(to)) {
    throw new HttpsError('invalid-argument', 'status must be draft, open, or locked.');
  }
  if (to === 'open' && (await isSeasonArchived(db, year))) {
    throw new HttpsError(
      'failed-precondition',
      "This season is archived, so a week can't be opened in it. Reopen the season from Seasons first.",
    );
  }

  const weekRef = db.doc(weekPath(year, weekId));
  const update = await db.runTransaction(async (tx) => {
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
    auditInTransaction(tx, db, {
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
  if (to === 'locked') await recountWeek(db, year, weekId); // reconcile once no more entries can arrive
  return update;
});

// ---- adminUpsertEntry (Sprint 4): enter or edit someone's picks while the week is open ----
export const adminUpsertEntry = onCall(async (req) => {
  requireAdmin(req);
  return upsertEntry(db, {
    year: requireId(req.data?.year, 'year'),
    weekId: requireId(req.data?.weekId, 'weekId'),
    playerId: requireId(req.data?.playerId, 'playerId'),
    entry: req.data?.entry,
    late: false,
    nowMs: Date.now(),
    actorUid: req.auth!.uid,
  });
});

// ---- adminLateOverride (Sprint 4): an entry or edit after the lock, with a typed reason ----
export const adminLateOverride = onCall(async (req) => {
  requireAdmin(req);
  return upsertEntry(db, {
    year: requireId(req.data?.year, 'year'),
    weekId: requireId(req.data?.weekId, 'weekId'),
    playerId: requireId(req.data?.playerId, 'playerId'),
    entry: req.data?.entry,
    late: true,
    reason: req.data?.reason,
    nowMs: Date.now(),
    actorUid: req.auth!.uid,
  });
});

// ---- adminDeleteEntry (Sprint 4): remove an entry, with a typed reason ----
export const adminDeleteEntry = onCall(async (req) => {
  requireAdmin(req);
  return deleteEntry(db, {
    year: requireId(req.data?.year, 'year'),
    weekId: requireId(req.data?.weekId, 'weekId'),
    playerId: requireId(req.data?.playerId, 'playerId'),
    reason: req.data?.reason,
    actorUid: req.auth!.uid,
  });
});

// ---- adminDeletePlayer (D-094): delete a player who has no history, with a typed reason ----
// `dryRun: true` only answers "can this player be deleted, and if not, why not?" for the screen.
export const adminDeletePlayer = onCall(async (req) => {
  requireAdmin(req);
  const playerId = requireId(req.data?.playerId, 'playerId');
  if (req.data?.dryRun === true) return inspectPlayerDelete(db, playerId);
  return deletePlayer(db, {
    playerId,
    reason: req.data?.reason,
    actorUid: req.auth!.uid,
  });
});

// ---- adminSetPayment (Sprint 3): mark an entry paid or unpaid -----------------
export const adminSetPayment = onCall(async (req) => {
  requireAdmin(req);
  const request = parsePaymentRequest(req.data);
  if (!request.ok) throw new HttpsError('invalid-argument', request.message);
  return setPayment(db, {
    year: requireId(req.data?.year, 'year'),
    weekId: requireId(req.data?.weekId, 'weekId'),
    playerId: requireId(req.data?.playerId, 'playerId'),
    status: request.status,
    method: request.method,
    actorUid: req.auth!.uid,
  });
});

// ---- adminListEntries (Sprint 3): the payments queue, in one round trip -------
export const adminListEntries = onCall(async (req) => {
  requireAdmin(req);
  const year = requireId(req.data?.year, 'year');
  const weekId = requireId(req.data?.weekId, 'weekId');
  const list = await listEntries(db, year, weekId);
  if (!list) throw new HttpsError('not-found', 'That week does not exist.');
  return list;
});

// ---- adminEnterResults (Sprint 3): winners per game and the Monday night total ----
export const adminEnterResults = onCall(async (req) => {
  requireAdmin(req);
  return enterResults(db, {
    year: requireId(req.data?.year, 'year'),
    weekId: requireId(req.data?.weekId, 'weekId'),
    results: req.data?.results,
    mnfTotal: req.data?.mnfTotal ?? null,
    actorUid: req.auth!.uid,
  });
});

// ---- adminCorrectResults (Sprint 6): fix a result after the winner is published ----
export const adminCorrectResults = onCall(async (req) => {
  requireAdmin(req);
  const result = await correctResults(db, {
    year: requireId(req.data?.year, 'year'),
    weekId: requireId(req.data?.weekId, 'weekId'),
    results: req.data?.results,
    mnfTotal: req.data?.mnfTotal ?? null,
    reason: req.data?.reason,
    actorUid: req.auth!.uid,
  });
  await refreshStandings([requireId(req.data?.year, 'year')]);
  return result;
});

// ---- adminPreviewWinner (Sprint 3): standings and the winner "if the games ended now" ----
export const adminPreviewWinner = onCall(async (req) => {
  requireAdmin(req);
  return previewWinner(
    db,
    requireId(req.data?.year, 'year'),
    requireId(req.data?.weekId, 'weekId'),
  );
});

// ---- adminPublishWinner (Sprint 3): decide the winner and make the week final ----
export const adminPublishWinner = onCall(async (req) => {
  requireAdmin(req);
  const expected: unknown = req.data?.expectedPlayerIds;
  if (!Array.isArray(expected) || !expected.every((id) => typeof id === 'string')) {
    throw new HttpsError(
      'invalid-argument',
      'Confirm the winner you reviewed (expectedPlayerIds).',
    );
  }
  const result = await publishWinner(db, {
    year: requireId(req.data?.year, 'year'),
    weekId: requireId(req.data?.weekId, 'weekId'),
    expectedPlayerIds: expected,
    actorUid: req.auth!.uid,
  });
  await refreshStandings([requireId(req.data?.year, 'year')]);
  return result;
});

// ---- adminMarkPayout (Sprint 3): record that the winner was paid (D-042) ----
export const adminMarkPayout = onCall(async (req) => {
  requireAdmin(req);
  const sent = req.data?.sent;
  if (typeof sent !== 'boolean')
    throw new HttpsError('invalid-argument', 'sent must be true or false.');
  return markPayout(db, {
    year: requireId(req.data?.year, 'year'),
    weekId: requireId(req.data?.weekId, 'weekId'),
    sent,
    actorUid: req.auth!.uid,
  });
});

// ---- Seasons (Sprint 10) ------------------------------------------------------
export const adminListSeasons = onCall(async (req) => {
  requireAdmin(req);
  return { seasons: await listSeasons(db) };
});

/** adminSetSeasonStatus: archive a finished season, or reopen one. */
export const adminSetSeasonStatus = onCall(async (req) => {
  requireAdmin(req);
  const status = req.data?.status;
  if (status !== 'active' && status !== 'archived') {
    throw new HttpsError('invalid-argument', 'status must be active or archived.');
  }
  return setSeasonStatus(db, {
    year: requireId(req.data?.year, 'year'),
    status,
    actorUid: req.auth!.uid,
  });
});

// ---- Standings and reports (Sprint 7) ----------------------------------------

/** adminRecomputeStandings: work the season standings and all-time stats out again, on request. */
export const adminRecomputeStandings = onCall(async (req) => {
  requireAdmin(req);
  const year = requireId(req.data?.year, 'year');
  const standings = await recomputeStandings(db, year, savedLogins);
  const allTime = await recomputeAllTime(db);
  return { year, players: standings.players, removed: standings.removed, allTime: allTime.players };
});

/** adminSeasonReport: the week-by-week table for the Reports screen and its CSV export. */
export const adminSeasonReport = onCall(async (req) => {
  requireAdmin(req);
  return seasonReport(db, requireId(req.data?.year, 'year'));
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
      auditInTransaction(tx, db, {
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

/**
 * requestClaim (Sprint 5). A player asks to be linked to the history the pool already has for them.
 * The answer is the same whoever they name. Rate limited, and it needs a saved account (D-060).
 */
export const requestClaim = onCall(async (req) => {
  requireSignedIn(req);
  return requestClaimFor(db, {
    uid: req.auth!.uid,
    email: req.auth!.token.email ?? null,
    isGuest: req.auth!.token.firebase?.sign_in_provider === 'anonymous',
    data: req.data,
    nowMs: Date.now(),
  });
});

/**
 * reportClientError (Sprint 9). The web app sends script errors here so a broken screen shows up in
 * the logs. Any signed-in login may call it, guests included, since they are who hits the errors.
 * Limited per instance, cut to length, and it never fails the caller.
 */
const allowClientError = createRateLimit(30);
export const reportClientError = onCall(async (req) => {
  requireSignedIn(req);
  const report = tidyClientError(req.data);
  if (!report || !allowClientError(Date.now())) return { logged: false };
  logger.error(`Client error: ${report.message}`, {
    ...report,
    uid: req.auth!.uid,
    guest: req.auth!.token.firebase?.sign_in_provider === 'anonymous',
  });
  return { logged: true };
});

// ---- Firestore triggers (Sprint 3) -------------------------------------------

/** Players in: recount only when an entry is created or deleted, never on an edit (D-048). */
export const onEntryWritten = onDocumentWritten(
  { document: 'seasons/{year}/weeks/{weekId}/entries/{playerId}', database: FIRESTORE_DATABASE_ID },
  async (event) => {
    const change = event.data;
    if (change?.before.exists && change.after.exists) return;
    await recountWeek(db, event.params.year, event.params.weekId);
  },
);

/** Players paid: recount when a payment is created or its status changes. */
export const onPaymentWritten = onDocumentWritten(
  {
    document: 'seasons/{year}/weeks/{weekId}/entries/{playerId}/payment/{doc}',
    database: FIRESTORE_DATABASE_ID,
  },
  async (event) => {
    const change = event.data;
    if (change?.before.exists && change.after.exists) {
      if (change.before.get('paymentStatus') === change.after.get('paymentStatus')) return;
    }
    await recountWeek(db, event.params.year, event.params.weekId);
  },
);

/** When results or the Monday night total change, write each entry's record. */
export const onResultsWritten = onDocumentWritten(
  { document: 'seasons/{year}/weeks/{weekId}', database: FIRESTORE_DATABASE_ID },
  async (event) => {
    const change = event.data;
    if (!change?.after.exists) return;
    const sameTotal =
      (change.before.get('mnfTotal') ?? null) === (change.after.get('mnfTotal') ?? null);
    if (
      change.before.exists &&
      sameTotal &&
      sameResults(change.before.get('results'), change.after.get('results'))
    ) {
      return; // a status change, a counter update, or an edit that did not touch results
    }
    const written = await writeEntryRecords(db, event.params.year, event.params.weekId);
    logger.info('entry records updated', {
      year: event.params.year,
      weekId: event.params.weekId,
      written,
    });
  },
);

// ---- Scheduled (Sprint 3): at lockAt set status='locked' and revealed=true ----
export const lockWeeks = onSchedule(
  { schedule: 'every 1 minutes', timeZone: 'America/Toronto' },
  async () => {
    const locked = await lockDueWeeks(db, Date.now());
    if (locked.length > 0) logger.info('weeks locked', { locked });
  },
);
