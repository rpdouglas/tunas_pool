/**
 * Shop Tablet Kiosk callables (D-142).
 * Allows players at the pawn shop tablet to:
 * 1. View the active roster names (names only, no PII, no picks)
 * 2. Authenticate or set up a 4-digit PIN
 * 3. Register as a walk-in / newcomer
 * 4. Submit picks with cash / e-transfer declaration before lock
 * 5. Allow counter staff (Devon/Ryan) to reset a player's PIN in person
 */
import crypto from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type {
  KioskRegisterInput,
  KioskRegisterResult,
  KioskRosterPlayer,
  KioskSubmitInput,
  KioskSubmitResult,
  KioskVerifyPinInput,
  KioskVerifyPinResult,
} from '../../shared/kiosk';
import { isValidPin } from '../../shared/kiosk';
import { normalizePhone } from '../../shared/phone';
import type { StaffRole } from '../../shared/roles';
import type { Game, PaymentIntent, PaymentMethod, Pick } from '../../shared/types';
import { auditInTransaction } from './audit';

export function hashPin(pin: string, salt: string): string {
  return crypto.scryptSync(pin.trim(), salt, 64).toString('hex');
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function comparePin(pin: string, salt: string, storedHash: string): boolean {
  const computed = hashPin(pin, salt);
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const weekPath = (year: string, weekId: string) => `seasons/${year}/weeks/${weekId}`;

/**
 * Return active players on the roster for the kiosk dropdown.
 * Display names and hasPin only; phone, email, notes, and picks NEVER leave the server.
 */
export async function listKioskRoster(db: Firestore): Promise<KioskRosterPlayer[]> {
  const snap = await db.collection('players').get();
  const players: KioskRosterPlayer[] = [];

  for (const doc of snap.docs) {
    if (doc.get('mergedInto')) continue;
    if (doc.get('active') === false) continue;
    const displayName = String(doc.get('displayName') || '').trim();
    if (!displayName) continue;

    players.push({
      playerId: doc.id,
      displayName,
      hasPin: Boolean(doc.get('kioskPinHash')),
    });
  }

  return players.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
}

/**
 * Verify a player's 4-digit PIN on the kiosk tablet.
 * Rate-limits failed attempts: locks for 5 minutes after 5 consecutive failures.
 */
export async function verifyKioskPin(
  db: Firestore,
  input: KioskVerifyPinInput & { nowMs?: number },
): Promise<KioskVerifyPinResult> {
  const { playerId, pin } = input;
  const now = input.nowMs ?? Date.now();
  const playerRef = db.doc(`players/${playerId}`);
  const snap = await playerRef.get();

  if (!snap.exists) {
    throw new HttpsError('not-found', 'Player not found on the roster.');
  }
  if (snap.get('active') === false || snap.get('mergedInto')) {
    throw new HttpsError('failed-precondition', 'This player account is inactive.');
  }

  const storedHash = snap.get('kioskPinHash') as string | undefined;
  const salt = snap.get('kioskPinSalt') as string | undefined;

  // New or existing player without a PIN yet
  if (!storedHash || !salt) {
    return { valid: true, needsPinSetup: true };
  }

  // Check lockout
  const lockedUntil = snap.get('kioskLockedUntil');
  if (lockedUntil && typeof lockedUntil.toMillis === 'function') {
    const lockMs = lockedUntil.toMillis();
    if (lockMs > now) {
      const mins = Math.max(1, Math.ceil((lockMs - now) / 60_000));
      return {
        valid: false,
        locked: true,
        message: `Account is temporarily locked due to too many failed attempts. Try again in ${mins} minute(s) or ask Devon at the counter to reset your PIN.`,
      };
    }
  }

  if (!isValidPin(pin)) {
    return { valid: false, message: 'PIN must be 4 digits.' };
  }

  const matches = comparePin(pin, salt, storedHash);
  if (matches) {
    // Reset failed counter if there were failed attempts
    const failed = Number(snap.get('kioskFailedAttempts') || 0);
    if (failed > 0 || lockedUntil) {
      await playerRef.update({
        kioskFailedAttempts: 0,
        kioskLockedUntil: null,
      });
    }

    let existingEntry = null;
    if (input.year && input.weekId) {
      const picksRef = db.doc(`seasons/${input.year}/weeks/${input.weekId}/entries/${playerId}/private/picks`);
      const paymentRef = db.doc(`seasons/${input.year}/weeks/${input.weekId}/entries/${playerId}/payment/current`);
      const [picksSnap, paymentSnap] = await Promise.all([picksRef.get(), paymentRef.get()]);
      if (picksSnap.exists) {
        existingEntry = {
          picks: (picksSnap.get('picks') as Record<string, Pick>) || {},
          tiebreakerTotal: Number(picksSnap.get('tiebreakerTotal') || 0),
          paymentMethod: paymentSnap.exists
            ? ((paymentSnap.get('paymentMethod') as PaymentMethod | undefined) ?? null)
            : null,
          paymentIntent: paymentSnap.exists
            ? ((paymentSnap.get('paymentIntent') as PaymentIntent | undefined) ?? null)
            : null,
        };
      }
    }

    return { valid: true, existingEntry };
  }

  // Failed PIN attempt
  const prevFailed = Number(snap.get('kioskFailedAttempts') || 0);
  const newFailed = prevFailed + 1;
  const updates: Record<string, unknown> = {
    kioskFailedAttempts: newFailed,
  };

  if (newFailed >= 5) {
    updates.kioskLockedUntil = FieldValue.serverTimestamp(); // or explicit 5m timestamp
    const lockExpiry = new Date(now + 5 * 60_000);
    updates.kioskLockedUntil = lockExpiry;
    await playerRef.update(updates);
    return {
      valid: false,
      locked: true,
      remainingAttempts: 0,
      message: 'Too many incorrect attempts. Account locked for 5 minutes. Devon at the counter can reset your PIN.',
    };
  }

  await playerRef.update(updates);
  const remaining = Math.max(0, 5 - newFailed);
  return {
    valid: false,
    remainingAttempts: remaining,
    message: `Incorrect PIN. ${remaining} attempt(s) remaining before temporary lockout.`,
  };
}

/**
 * Set or change a player's 4-digit PIN.
 */
export async function setKioskPin(
  db: Firestore,
  input: {
    playerId: string;
    currentPin: string | null;
    newPin: string;
    actorUid: string;
  },
): Promise<void> {
  const { playerId, currentPin, newPin, actorUid } = input;
  if (!isValidPin(newPin)) {
    throw new HttpsError('invalid-argument', 'New PIN must be exactly 4 digits.');
  }

  const playerRef = db.doc(`players/${playerId}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(playerRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Player not found.');

    const storedHash = snap.get('kioskPinHash') as string | undefined;
    const salt = snap.get('kioskPinSalt') as string | undefined;

    // If already has PIN and caller didn't provide current PIN
    if (storedHash && salt) {
      if (!currentPin || !comparePin(currentPin, salt, storedHash)) {
        throw new HttpsError('permission-denied', 'Current PIN is incorrect.');
      }
    }

    const newSalt = generateSalt();
    const newHash = hashPin(newPin, newSalt);

    tx.update(playerRef, {
      kioskPinHash: newHash,
      kioskPinSalt: newSalt,
      kioskPinSetAt: FieldValue.serverTimestamp(),
      kioskFailedAttempts: 0,
      kioskLockedUntil: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    auditInTransaction(tx, db, {
      actorUid,
      action: 'kiosk.setPin',
      target: `players/${playerId}`,
      before: { hasPin: Boolean(storedHash) },
      after: { displayName: snap.get('displayName'), hasPin: true },
    });
  });
}

/**
 * Register a brand-new walk-in player from the kiosk tablet.
 */
export async function registerKioskPlayer(
  db: Firestore,
  input: KioskRegisterInput & { actorUid: string },
): Promise<KioskRegisterResult> {
  const displayName = input.displayName.trim();
  if (!displayName || displayName.length > 60) {
    throw new HttpsError('invalid-argument', 'Display name must be between 1 and 60 characters.');
  }
  if (!isValidPin(input.pin)) {
    throw new HttpsError('invalid-argument', 'PIN must be 4 digits.');
  }

  const contactRaw = input.phoneOrEmail.trim();
  let phone: string | null = null;
  let email: string | null = null;

  if (contactRaw.includes('@')) {
    if (!contactRaw.includes('.') || contactRaw.length < 5) {
      throw new HttpsError('invalid-argument', 'Enter a valid email address.');
    }
    email = contactRaw.toLowerCase();
  } else {
    phone = normalizePhone(contactRaw);
    if (!phone) {
      throw new HttpsError('invalid-argument', 'Enter a valid 10-digit phone number or email.');
    }
  }

  const salt = generateSalt();
  const hash = hashPin(input.pin, salt);

  const playersCol = db.collection('players');
  const playerRef = playersCol.doc();
  const playerId = playerRef.id;

  await db.runTransaction(async (tx) => {
    tx.set(playerRef, {
      displayName,
      phone,
      email,
      origin: 'kiosk',
      claimedByUid: null,
      active: true,
      kioskPinHash: hash,
      kioskPinSalt: salt,
      kioskPinSetAt: FieldValue.serverTimestamp(),
      kioskFailedAttempts: 0,
      kioskLockedUntil: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    auditInTransaction(tx, db, {
      actorUid: input.actorUid,
      action: 'player.kioskRegister',
      target: `players/${playerId}`,
      before: null,
      after: { displayName, origin: 'kiosk' },
    });
  });

  return { playerId, displayName };
}

/**
 * Submit picks directly from the shop tablet.
 * Server strictly checks:
 * 1. Week is open and now < week.lockAt (Server-enforced lockout!)
 * 2. Player PIN is valid
 * 3. 15 picks + tiebreaker present
 */
export async function submitKioskEntry(
  db: Firestore,
  input: KioskSubmitInput & { actorUid: string; nowMs?: number },
): Promise<KioskSubmitResult> {
  const { year, weekId, playerId, pin, picks, tiebreakerTotal, paymentMethod, paymentIntent } = input;
  const now = input.nowMs ?? Date.now();

  const weekRef = db.doc(weekPath(year, weekId));
  const playerRef = db.doc(`players/${playerId}`);
  const entryRef = weekRef.collection('entries').doc(playerId);
  const picksRef = entryRef.collection('private').doc('picks');
  const paymentRef = entryRef.collection('payment').doc('current');

  await db.runTransaction(async (tx) => {
    const [weekSnap, playerSnap] = await Promise.all([
      tx.get(weekRef),
      tx.get(playerRef),
    ]);

    if (!weekSnap.exists) throw new HttpsError('not-found', 'That week does not exist.');
    const weekStatus = weekSnap.get('status');
    const lockAt = weekSnap.get('lockAt');
    const lockAtMs = lockAt && typeof lockAt.toMillis === 'function' ? lockAt.toMillis() : 0;

    if (weekStatus !== 'open' || now >= lockAtMs) {
      throw new HttpsError('failed-precondition', 'Picks are locked for this week.');
    }

    if (!playerSnap.exists || playerSnap.get('active') === false || playerSnap.get('mergedInto')) {
      throw new HttpsError('not-found', 'Player profile not found or inactive.');
    }

    const salt = playerSnap.get('kioskPinSalt') as string | undefined;
    const storedHash = playerSnap.get('kioskPinHash') as string | undefined;

    if (!salt || !storedHash || !comparePin(pin, salt, storedHash)) {
      throw new HttpsError('permission-denied', 'Incorrect 4-digit PIN.');
    }

    const games = (weekSnap.get('games') as Game[] | undefined) ?? [];
    if (games.length === 0) {
      throw new HttpsError('failed-precondition', 'No games configured for this week.');
    }

    // Verify all games picked
    for (const g of games) {
      const choice = picks[g.id];
      if (choice !== 'home' && choice !== 'away') {
        throw new HttpsError('invalid-argument', `Missing pick for game ${g.away} @ ${g.home}.`);
      }
    }

    if (typeof tiebreakerTotal !== 'number' || tiebreakerTotal < 0 || tiebreakerTotal > 200) {
      throw new HttpsError('invalid-argument', 'Tiebreaker points must be between 0 and 200.');
    }

    const displayName = String(playerSnap.get('displayName') || '');

    // Write entry document
    tx.set(
      entryRef,
      {
        playerId,
        displayName,
        enteredBy: 'kiosk',
        source: 'kiosk',
        paperPhotoPath: null,
        lateOverride: null,
        picksSubmittedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // Write private picks
    const cleanPicks: Record<string, Pick> = {};
    for (const g of games) {
      cleanPicks[g.id] = picks[g.id];
    }
    tx.set(picksRef, {
      picks: cleanPicks,
      tiebreakerTotal: Math.round(tiebreakerTotal),
      submittedAt: FieldValue.serverTimestamp(),
    });

    // Write payment declaration
    tx.set(
      paymentRef,
      {
        paymentMethod: paymentMethod === 'etransfer' ? 'etransfer' : 'cash',
        paymentIntent: paymentIntent === 'already_did' ? 'already_did' : 'will_do',
        paymentStatus: 'unpaid',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    auditInTransaction(tx, db, {
      actorUid: input.actorUid,
      action: 'kiosk.entrySubmit',
      target: entryRef.path,
      year,
      weekId,
      before: null,
      after: { displayName, tiebreakerTotal },
    });
  });

  return { playerId, picksSubmittedAtMs: now };
}

/**
 * Counter staff (Devon/Ryan) in-person PIN reset.
 * Clears the PIN and lockout counters so the player can set a fresh PIN at the kiosk.
 */
export async function resetKioskPinByStaff(
  db: Firestore,
  input: {
    playerId: string;
    actorUid: string;
    actorRole?: StaffRole;
    actorEmail?: string | null;
  },
): Promise<void> {
  const { playerId, actorUid, actorRole, actorEmail } = input;
  const playerRef = db.doc(`players/${playerId}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(playerRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Player not found.');

    tx.update(playerRef, {
      kioskPinHash: FieldValue.delete(),
      kioskPinSalt: FieldValue.delete(),
      kioskPinSetAt: FieldValue.delete(),
      kioskFailedAttempts: 0,
      kioskLockedUntil: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    auditInTransaction(tx, db, {
      actorUid,
      actorRole: actorRole === 'counter' ? 'counter' : undefined,
      actorEmail: actorEmail ?? undefined,
      action: 'kiosk.resetPin',
      target: `players/${playerId}`,
      before: { hasPin: Boolean(snap.get('kioskPinHash')) },
      after: { displayName: snap.get('displayName'), hasPin: false },
    });
  });
}
