/**
 * Claims: a player asks to link their login to a profile the pool already has for them (paper,
 * text, or phone history), and the admin approves or rejects it (docs/DATA_MODEL.md §3.3, §5).
 * Pure logic, shared by the screens and the callables, so every case is unit tested.
 *
 * The rule that shapes all of it: asking reveals nothing (PERSONAS anti-persona E, the Snoop). The
 * claimant can read their own claim document, so it only ever holds what they typed. Matches are
 * worked out for the admin, on demand, and never stored.
 */
import { findDuplicateFlags, type DuplicateReason } from './duplicates';
import type { Parsed } from './paperEntry';
import { normalizePhone } from './phone';

export const MAX_CLAIMS_PER_DAY = 3;
export const MAX_CLAIM_CANDIDATES = 5;
export const MAX_DECISION_NOTE = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ClaimRequest {
  claimedName: string;
  /** E.164, or null when the player left it blank. */
  claimedPhone: string | null;
}

const fail = (message: string): Parsed<never> => ({ ok: false, message });

/** Reads the callable's input. An omitted field arrives as null and means the same as blank. */
export function parseClaimRequest(data: unknown): Parsed<ClaimRequest> {
  const input = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const name =
    typeof input.claimedName === 'string' ? input.claimedName.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2) return fail('Enter the name the pool knows you by, like Rosalie M.');
  if (name.length > 60) return fail('Keep the name under 60 characters.');

  const rawPhone = typeof input.claimedPhone === 'string' ? input.claimedPhone.trim() : '';
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawPhone && !phone) {
    return fail('Enter a 10-digit phone number, like 613-555-0123, or leave it blank.');
  }
  return { ok: true, value: { claimedName: name, claimedPhone: phone } };
}

export type ClaimGate = { ok: true } | { ok: false; code: ClaimGateCode; message: string };
export type ClaimGateCode = 'needs_account' | 'already_linked' | 'already_pending' | 'too_many';

/** Whether this login may ask right now. The same answers whoever they name. */
export function claimGate(input: {
  isGuest: boolean;
  /** The login is already linked to a roster profile. */
  linkedToRoster: boolean;
  claims: { status: string; createdAtMs: number }[];
  nowMs: number;
}): ClaimGate {
  if (input.isGuest) {
    return {
      ok: false,
      code: 'needs_account',
      message: 'Save your account with an email first, then ask to link your history.',
    };
  }
  if (input.linkedToRoster) {
    return { ok: false, code: 'already_linked', message: 'Your history is already linked.' };
  }
  if (input.claims.some((c) => c.status === 'pending')) {
    return {
      ok: false,
      code: 'already_pending',
      message: 'You already have a request waiting for the pool to look at.',
    };
  }
  const today = input.claims.filter((c) => input.nowMs - c.createdAtMs < DAY_MS).length;
  if (today >= MAX_CLAIMS_PER_DAY) {
    return {
      ok: false,
      code: 'too_many',
      message: "You've asked a few times today. Try again tomorrow, or talk to the pool.",
    };
  }
  return { ok: true };
}

export interface ClaimablePlayer {
  playerId: string;
  displayName: string;
  phone: string | null;
  /** Already linked to a login. It can't be claimed again until it is unlinked. */
  linked: boolean;
  active: boolean;
}

export interface ClaimCandidate extends ClaimablePlayer {
  reasons: DuplicateReason[];
}

const REASON_RANK: Record<DuplicateReason, number> = {
  phone: 0,
  email: 1,
  name: 2,
  similar_name: 3,
};
const bestRank = (reasons: DuplicateReason[]) => Math.min(...reasons.map((r) => REASON_RANK[r]));

/**
 * Profiles that might be the claimant, best first: the same phone, then the same name, then a
 * similar name. For the admin only. Profiles in `exclude` (the claimant's own) are left out.
 */
export function rankClaimCandidates(
  claim: ClaimRequest,
  players: ClaimablePlayer[],
  exclude: string[] = [],
): ClaimCandidate[] {
  const CLAIM = '__claim__';
  const others = players.filter((p) => !exclude.includes(p.playerId));
  const flags = findDuplicateFlags([
    { playerId: CLAIM, displayName: claim.claimedName, phone: claim.claimedPhone, email: null },
    ...others.map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      phone: p.phone,
      email: null,
    })),
  ]);
  return flags
    .filter((f) => f.playerIds.includes(CLAIM))
    .map((f) => ({
      ...others.find((p) => f.playerIds.includes(p.playerId))!,
      reasons: f.reasons,
    }))
    .sort(
      (a, b) =>
        bestRank(a.reasons) - bestRank(b.reasons) ||
        b.reasons.length - a.reasons.length ||
        Number(b.active) - Number(a.active) ||
        a.displayName.localeCompare(b.displayName),
    )
    .slice(0, MAX_CLAIM_CANDIDATES);
}

/** The first candidate that can still be claimed, or null. */
export function suggestedCandidate(candidates: ClaimCandidate[]): string | null {
  return candidates.find((c) => !c.linked)?.playerId ?? null;
}

/**
 * Weeks where both profiles have an entry. A merge is refused while there are any: one person
 * gets one entry a week, and folding two into one quietly would hide that (PERSONAS anti-persona A).
 */
export function mergeConflicts(fromWeeks: string[], intoWeeks: string[]): string[] {
  const into = new Set(intoWeeks);
  return fromWeeks.filter((w) => into.has(w)).sort();
}

/** An optional, friendly note the claimant sees with a rejection. */
export function parseDecisionNote(value: unknown): Parsed<string | null> {
  const note = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (note.length > MAX_DECISION_NOTE) {
    return fail(`Keep the note under ${MAX_DECISION_NOTE} characters.`);
  }
  return { ok: true, value: note || null };
}
