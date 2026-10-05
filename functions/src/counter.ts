/**
 * What the counter role (Devon, D-095) works from: the roster for this week without anything
 * private, and adding or fixing a roster player. Phones, emails, notes, and picks never leave the
 * server for the counter. The commissioner can call these too.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { CounterOverview, CounterRow, CounterSaveResult } from '../../shared/adminTypes';
import { findDuplicateFlags } from '../../shared/duplicates';
import { normalizePhone } from '../../shared/phone';
import type { StaffRole } from '../../shared/roles';
import type { EntrySource, PaymentMethod, PaymentStatus } from '../../shared/types';
import { ASK_COMMISSIONER } from '../../shared/counterPolicy';
import { auditInTransaction } from './audit';

const weekPath = (year: string, weekId: string) => `seasons/${year}/weeks/${weekId}`;

export async function loadCounterOverview(
  db: Firestore,
  input: { year: string; weekId: string; role: StaffRole },
): Promise<CounterOverview> {
  const { year, weekId, role } = input;
  const weekRef = db.doc(weekPath(year, weekId));
  const [week, players, entries] = await Promise.all([
    weekRef.get(),
    db.collection('players').get(),
    weekRef.collection('entries').get(),
  ]);
  if (!week.exists) throw new HttpsError('not-found', 'That week does not exist.');
  // A week still being set up is the commissioner's (the rules keep drafts admin-only too).
  if (role === 'counter' && week.get('status') === 'draft') {
    throw new HttpsError('permission-denied', `That week isn't open yet. ${ASK_COMMISSIONER}`);
  }

  const entryById = new Map(entries.docs.map((d) => [d.id, d]));
  // `getAll` needs at least one reference, and a week has no entries until the first sheet is in.
  const paymentSnaps =
    entries.size === 0
      ? []
      : await db.getAll(...entries.docs.map((d) => d.ref.collection('payment').doc('current')));
  const paymentById = new Map(paymentSnaps.map((p) => [p.ref.parent.parent!.id, p]));

  const rows: CounterRow[] = players.docs
    .filter((p) => !p.get('mergedInto'))
    .map((p) => {
      const entry = entryById.get(p.id);
      const payment = paymentById.get(p.id);
      return {
        playerId: p.id,
        displayName: String(p.get('displayName') ?? ''),
        active: p.get('active') !== false,
        origin: p.get('origin') === 'self' ? ('self' as const) : ('admin' as const),
        entered: Boolean(entry),
        source: (entry?.get('source') as EntrySource | undefined) ?? null,
        late: Boolean(entry?.get('lateOverride')),
        paymentStatus: (payment?.exists
          ? payment.get('paymentStatus')
          : null) as PaymentStatus | null,
        paymentMethod: (payment?.exists
          ? payment.get('paymentMethod')
          : null) as PaymentMethod | null,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { rows };
}

function parseName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!name) {
    throw new HttpsError(
      'invalid-argument',
      'Enter the name to show on the leaderboard, like Rosalie M.',
    );
  }
  if (name.length > 60)
    throw new HttpsError('invalid-argument', 'Keep the name under 60 characters.');
  return name;
}

/**
 * Add a roster player, or fix a name, a phone, or the usual way they pay. Only what is sent is
 * changed: the counter cannot see the stored phone or note, so a blank phone means "leave it" and
 * is never saved as blank. Notes, Inactive, delete, merge, and unlink stay with the commissioner.
 * A possible double comes back for Devon to decide unless `force` is set.
 */
export async function saveCounterPlayer(
  db: Firestore,
  input: {
    playerId: string | null;
    displayName: unknown;
    phone?: unknown;
    usualPayment?: unknown;
    force?: unknown;
    role: StaffRole;
    actorUid: string;
    actorEmail: string | null;
  },
): Promise<CounterSaveResult> {
  const displayName = parseName(input.displayName);
  const phoneText = typeof input.phone === 'string' ? input.phone.trim() : '';
  const phone = phoneText ? normalizePhone(phoneText) : null;
  if (phoneText && !phone) {
    throw new HttpsError(
      'invalid-argument',
      'Enter a 10-digit phone number, like 613-555-0123, or leave it blank.',
    );
  }
  const usualPayment =
    input.usualPayment === 'cash' || input.usualPayment === 'etransfer'
      ? (input.usualPayment as PaymentMethod)
      : null;

  const players = await db.collection('players').get();
  const live = players.docs.filter((p) => !p.get('mergedInto'));
  const selfId = input.playerId ?? '__new__';

  if (input.playerId) {
    const target = live.find((p) => p.id === input.playerId);
    if (!target) throw new HttpsError('not-found', 'That player is no longer on the roster.');
    if (target.get('origin') === 'self') {
      throw new HttpsError(
        'permission-denied',
        `${target.get('displayName')} signed up on the website and manages their own details.`,
      );
    }
  }

  if (input.force !== true) {
    const flags = findDuplicateFlags([
      { playerId: selfId, displayName, phone, email: null },
      ...live
        .filter((p) => p.id !== selfId)
        .map((p) => ({
          playerId: p.id,
          displayName: String(p.get('displayName') ?? ''),
          phone: (p.get('phone') as string | null) ?? null,
          email: null,
        })),
    ]).filter((f) => f.playerIds.includes(selfId));
    if (flags.length > 0) {
      return {
        saved: false,
        matches: flags.map((f) => {
          const other = live.find((p) => f.playerIds.includes(p.id) && p.id !== selfId)!;
          return {
            playerId: other.id,
            displayName: String(other.get('displayName') ?? ''),
            reasons: f.reasons,
          };
        }),
      };
    }
  }

  const ref = input.playerId ? db.doc(`players/${input.playerId}`) : db.collection('players').doc();
  const created = !input.playerId;
  await db.runTransaction(async (tx) => {
    const before = created ? null : await tx.get(ref);
    if (before && !before.exists) {
      throw new HttpsError('not-found', 'That player is no longer on the roster.');
    }
    if (created) {
      tx.create(ref, {
        displayName,
        phone,
        email: null,
        notes: null,
        claimedByUid: null,
        origin: 'admin',
        usualPayment,
        active: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.update(ref, {
        displayName,
        ...(phone ? { phone } : {}),
        ...(input.usualPayment === 'cash' || input.usualPayment === 'etransfer'
          ? { usualPayment }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    auditInTransaction(tx, db, {
      actorUid: input.actorUid,
      ...(input.role === 'counter'
        ? { actorRole: 'counter' as const, actorEmail: input.actorEmail }
        : {}),
      action: 'player.saved',
      target: ref.path,
      // Names and facts only: the log never keeps a phone number.
      before: before
        ? {
            displayName: before.get('displayName'),
            usualPayment: before.get('usualPayment') ?? null,
          }
        : null,
      after: { displayName, usualPayment, created, phoneSet: Boolean(phone) },
    });
  });
  return { saved: true, playerId: ref.id, created };
}
