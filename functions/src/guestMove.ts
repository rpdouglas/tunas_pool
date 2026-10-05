/**
 * Pure decision logic for `adoptGuestProfile`: when a guest saves their account with an email that
 * already has an account, their guest profile moves to that account. The playerId never changes;
 * only the login linked to it does (CLAUDE.md §4.1), so no entries are copied or rewritten.
 */
export type GuestMovePlan =
  | { action: 'nothing' } // the guest never submitted, so there is no profile to move
  | { action: 'relink'; playerId: string }
  | { action: 'needs_admin'; playerId: string }; // both logins have a profile: the admin merges them

export function planGuestMove(input: {
  guestUid: string;
  guestProfile: { claimedByUid: string | null } | null;
  callerUid: string;
  callerProfileIds: string[];
}): GuestMovePlan {
  const { guestUid, guestProfile, callerUid, callerProfileIds } = input;
  if (guestUid === callerUid || !guestProfile || guestProfile.claimedByUid !== guestUid) {
    return { action: 'nothing' };
  }
  if (callerProfileIds.length > 0) return { action: 'needs_admin', playerId: guestUid };
  return { action: 'relink', playerId: guestUid };
}
