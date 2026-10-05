/** The roster screen's logic: who is on it, who has entered this week, search, and the add form (pure, unit tested). */
import { findDuplicateFlags, normalizeName, type DuplicateReason } from '@shared/duplicates';
import type { EntryRow } from '@shared/adminTypes';
import { normalizePhone } from '@shared/phone';
import type { PaymentMethod } from '@shared/types';

/** A profile as the roster shows it. Phone and notes are admin-only (CLAUDE.md §8). */
export interface RosterPlayer {
  playerId: string;
  displayName: string;
  phone: string | null;
  usualPayment: PaymentMethod | null;
  notes: string | null;
  active: boolean;
  /** Added by the admin (paper, text, and phone players) or made by the player on the website. */
  origin: 'self' | 'admin';
  /** Linked to a login. */
  claimed: boolean;
}

export interface RosterRow extends RosterPlayer {
  /** This week's entry, or null for "not yet". */
  entry: EntryRow | null;
}

export type RosterFilter = 'not_yet' | 'entered' | 'all' | 'inactive';

export const ROSTER_FILTER_LABELS: Record<RosterFilter, string> = {
  not_yet: 'Not yet',
  entered: 'Entered',
  all: 'All',
  inactive: 'Inactive',
};

const matches = (row: RosterRow, filter: RosterFilter): boolean => {
  switch (filter) {
    case 'not_yet':
      return row.active && !row.entry;
    case 'entered':
      return Boolean(row.entry);
    case 'inactive':
      return !row.active;
    default:
      return row.active || Boolean(row.entry);
  }
};

/** Every player with this week's entry beside them, by name. */
export function rosterRows(players: RosterPlayer[], entries: EntryRow[]): RosterRow[] {
  const byPlayer = new Map(entries.map((e) => [e.playerId, e]));
  return players
    .map((p) => ({ ...p, entry: byPlayer.get(p.playerId) ?? null }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function filterRoster(rows: RosterRow[], filter: RosterFilter, query: string): RosterRow[] {
  const text = normalizeName(query);
  const digits = query.replace(/\D/g, '');
  return rows
    .filter((row) => matches(row, filter))
    .filter((row) => {
      if (!text && !digits) return true;
      const nameHit = text !== '' && normalizeName(row.displayName).includes(text);
      const phoneHit = digits.length >= 3 && (row.phone ?? '').replace(/\D/g, '').includes(digits);
      return nameHit || phoneHit;
    });
}

export function rosterCounts(rows: RosterRow[]): Record<RosterFilter, number> {
  return Object.fromEntries(
    (Object.keys(ROSTER_FILTER_LABELS) as RosterFilter[]).map((f) => [
      f,
      rows.filter((r) => matches(r, f)).length,
    ]),
  ) as Record<RosterFilter, number>;
}

export interface PlayerFormValues {
  displayName: string;
  phone: string;
  usualPayment: PaymentMethod | null;
  notes: string;
}

export interface PlayerFields {
  displayName: string;
  phone: string | null;
  usualPayment: PaymentMethod | null;
  notes: string | null;
}

export type PlayerFormErrors = Partial<Record<'displayName' | 'phone' | 'notes', string>>;

/** Only a name is needed (PERSONAS: Rosalie). A phone, if given, must be a real number. */
export function validatePlayer(
  values: PlayerFormValues,
): { ok: true; fields: PlayerFields } | { ok: false; errors: PlayerFormErrors } {
  const errors: PlayerFormErrors = {};
  const displayName = values.displayName.trim().replace(/\s+/g, ' ');
  if (!displayName)
    errors.displayName = 'Enter the name to show on the leaderboard, like Rosalie M.';
  else if (displayName.length > 60) errors.displayName = 'Keep the name under 60 characters.';

  const phone = values.phone.trim() ? normalizePhone(values.phone) : null;
  if (values.phone.trim() && !phone) {
    errors.phone = 'Enter a 10-digit phone number, like 613-555-0123, or leave it blank.';
  }
  const notes = values.notes.trim();
  if (notes.length > 500) errors.notes = 'Keep the notes under 500 characters.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    fields: { displayName, phone, usualPayment: values.usualPayment, notes: notes || null },
  };
}

/** People already on the roster who might be the same person. Flags only, never a block (D-022). */
export function possibleMatches(
  candidate: { playerId: string | null; displayName: string; phone: string | null },
  players: RosterPlayer[],
): { player: RosterPlayer; reasons: DuplicateReason[] }[] {
  const NEW = '__new__';
  const self = candidate.playerId ?? NEW;
  const others = players.filter((p) => p.playerId !== self);
  const flags = findDuplicateFlags([
    { playerId: self, displayName: candidate.displayName, phone: candidate.phone, email: null },
    ...others.map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      phone: p.phone,
      email: null,
    })),
  ]);
  return flags
    .filter((f) => f.playerIds.includes(self))
    .map((f) => ({
      player: others.find((p) => f.playerIds.includes(p.playerId))!,
      reasons: f.reasons,
    }));
}
