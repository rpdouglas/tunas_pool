/**
 * The audit log in plain words (PROJECT_PLAN Sprint 10), so a dispute can be settled by reading it
 * (PERSONAS: Gerald, the Commissioner). Pure: it turns one stored entry into a sentence, a place,
 * and who did it. The stored before and after stay available under it, untouched.
 */
export interface AuditRecord {
  actorUid: string;
  /** Written only for the counter role (D-095), so a counter's actions are under their own name. */
  actorRole?: string;
  actorEmail?: string | null;
  action: string;
  /** Document path the change was made to. */
  target: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  year?: string;
  weekId?: string;
}

export interface AuditText {
  /** What happened, as a sentence. */
  what: string;
  /** "Week 5 · 2026", or empty when the change isn't about a week. */
  where: string;
  who: string;
}

type Names = (playerId: string) => string | undefined;
const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
const text = (value: unknown, key: string): string | undefined => {
  const v = field(value, key);
  return typeof v === 'string' ? v : undefined;
};

/** The ID after a path segment: `idAfter('seasons/2026/weeks/wk05/entries/p1', 'entries')` is "p1". */
function idAfter(path: string, segment: string): string | undefined {
  const parts = path.split('/');
  const i = parts.lastIndexOf(segment);
  return i >= 0 ? parts[i + 1] : undefined;
}

const weekNumber = (weekId: string | undefined) =>
  weekId ? Number(weekId.replace(/\D/g, '')) || weekId : undefined;

export function describeActor(
  actorUid: string,
  myUid?: string,
  who?: { actorRole?: string; actorEmail?: string | null },
): string {
  if (actorUid === myUid) return 'You';
  if (who?.actorRole === 'counter') {
    return `Counter (${who.actorEmail || actorUid.slice(0, 6)})`;
  }
  if (actorUid === 'system:lockWeeks') return 'The pool, automatically';
  if (actorUid.startsWith('script:')) return `A one-off script (${actorUid.slice(7)})`;
  if (actorUid.startsWith('system:')) return 'The pool, automatically';
  return `Admin ${actorUid.slice(0, 6)}`;
}

const numbersText = (value: unknown) =>
  Array.isArray(value) && value.length ? `: ${value.join(' ')}` : '';

export function describeAudit(record: AuditRecord, names: Names, myUid?: string): AuditText {
  const { action, target, before, after } = record;
  const weekId = record.weekId ?? idAfter(target, 'weeks');
  const week = weekNumber(weekId);
  const playerId =
    idAfter(target, 'entries') ?? idAfter(target, 'players') ?? idAfter(target, 'bingoMembers');
  const player =
    (playerId && names(playerId)) ||
    text(after, 'displayName') ||
    text(before, 'displayName') ||
    'a player';
  const bingoCycle = idAfter(target, 'bingoCycles');
  const where = action.startsWith('bingo.')
    ? `Bingo${bingoCycle ? ` · game starting ${bingoCycle}` : ''}`
    : week !== undefined
      ? `Week ${week}${record.year ? ` · ${record.year}` : ''}`
      : (record.year ?? '');

  let what: string;
  switch (action) {
    case 'payment.set': {
      const paid = text(after, 'paymentStatus') === 'paid';
      const method = text(after, 'paymentMethod');
      what = paid
        ? `Marked ${player} paid${method ? ` (${method === 'etransfer' ? 'e-Transfer' : 'cash'})` : ''}`
        : `Put ${player} back to unpaid`;
      break;
    }
    case 'entry.adminUpsert':
      what = before ? `Changed the picks for ${player}` : `Entered picks for ${player}`;
      break;
    case 'entry.lateOverride':
      what = before
        ? `Changed ${player}'s picks after the lock`
        : `Added a late entry for ${player}`;
      break;
    case 'entry.delete':
      what = `Removed ${player}'s entry`;
      break;
    case 'week.status': {
      const to = text(after, 'status');
      what =
        to === 'open'
          ? 'Opened the week for picks'
          : to === 'locked'
            ? before
              ? 'Locked the week and revealed the picks'
              : 'Set the week up as locked (backfilled)'
            : to === 'draft'
              ? 'Took the week back to a draft'
              : `Changed the week to ${to ?? 'a new status'}`;
      break;
    }
    case 'week.results':
      what = 'Entered or changed the results';
      break;
    case 'week.winnerPublished': {
      const winners = field(field(after, 'winner'), 'displayNames');
      what = `Published the winner${Array.isArray(winners) && winners.length ? `: ${winners.join(' & ')}` : ''}`;
      break;
    }
    case 'week.payout':
      what =
        field(after, 'payoutSent') === true
          ? 'Marked the payout sent'
          : 'Marked the payout not sent';
      break;
    case 'week.correction': {
      if (field(after, 'backfilled') === true) what = 'Marked the week as backfilled';
      else if (text(before, 'weekId') && text(after, 'weekId'))
        what = `Renumbered the week (it was ${text(before, 'weekId')})`;
      else
        what =
          field(after, 'winnerChanged') === true
            ? 'Corrected a result, which changed the winner'
            : 'Corrected a result';
      break;
    }
    case 'claim.approved':
      what = `Linked ${player} to a login`;
      break;
    case 'claim.rejected':
      what = `Rejected a request to link as "${text(after, 'claimedName') ?? 'someone'}"`;
      break;
    case 'claim.unlinked':
      what = `Unlinked ${player} from their login`;
      break;
    case 'player.merged': {
      const into = text(after, 'mergedInto');
      what = `Merged ${player} into ${(into && names(into)) || text(after, 'intoDisplayName') || 'another player'}`;
      break;
    }
    case 'player.saved':
      what = before ? `Fixed the details for ${player}` : `Added ${player} to the roster`;
      break;
    case 'player.delete':
      what = `Deleted ${player} from the roster`;
      break;
    case 'player.role': {
      const role = text(after, 'role');
      what =
        role === 'admin'
          ? `Made ${player} an admin`
          : role === 'counter'
            ? `Gave ${player} the counter role`
            : `Took ${player}'s staff role away`;
      break;
    }
    case 'player.guestMoved':
      what = `Moved ${player}'s guest picks to their account`;
      break;
    case 'board.hidden':
      what = `Hid a post by ${player} on the board`;
      break;
    case 'board.mute':
      what =
        field(after, 'muted') === true
          ? `Muted ${player} on the board`
          : `Let ${player} post on the board again`;
      break;
    case 'kiosk.entrySubmit':
      what = `Submitted picks for ${player} at the shop kiosk`;
      break;
    case 'kiosk.setPin':
      what = `Set a kiosk PIN for ${player}`;
      break;
    case 'kiosk.resetPin':
      what = `Reset the kiosk PIN for ${player}`;
      break;
    case 'player.kioskRegister':
      what = `Registered ${player} at the shop kiosk`;
      break;
    case 'bingo.memberJoined':
      what = `${player} joined bingo with the invite code`;
      break;
    case 'bingo.memberAdded':
      what = `Added ${player} to bingo on paper, age checked in person`;
      break;
    case 'bingo.code':
      what = 'Changed the bingo invite code';
      break;
    case 'bingo.config':
      what = 'Changed the bingo settings (they apply from the next game)';
      break;
    case 'bingo.cardCreated':
      what = `Made a bingo card for ${player}${numbersText(field(after, 'numbers'))}`;
      break;
    case 'bingo.cardRetired':
      what = 'Retired a bingo card';
      break;
    case 'bingo.limit':
      what = `${player} changed their own bingo limit`;
      break;
    case 'bingo.payment': {
      const paid = field(after, 'paid') === true;
      const method = text(after, 'method');
      const draw = text(after, 'drawDate') ?? idAfter(target, 'draws');
      what = paid
        ? `Marked ${player}'s bingo card paid${method ? ` (${method === 'etransfer' ? 'e-Transfer' : 'cash'})` : ''}${draw ? ` for the ${draw} draw` : ''}${field(after, 'late') === true ? ', after the cutoff' : ''}`
        : `Took the money off ${player}'s bingo card`;
      break;
    }
    case 'bingo.drawEntered':
      what = `Typed in the bingo draw${numbersText(field(after, 'numbers'))}`;
      break;
    case 'bingo.drawApproved':
      what = `Approved the bingo draw${numbersText(field(after, 'numbers'))}`;
      break;
    case 'bingo.drawCorrected':
      what = `Corrected the bingo draw from${numbersText(field(before, 'numbers'))} to${numbersText(field(after, 'numbers'))}`;
      break;
    case 'bingo.drawSkipped':
      what = 'Skipped the bingo draw';
      break;
    case 'bingo.payout':
      what =
        field(after, 'paidOut') === true
          ? `Marked ${player}'s bingo winnings paid`
          : `Marked ${player}'s bingo winnings not paid`;
      break;
    case 'bingo.cycle': {
      const status = text(after, 'status');
      const winners = field(after, 'winners');
      const names = Array.isArray(winners)
        ? winners
            .map((w) => text(w, 'displayName'))
            .filter(Boolean)
            .join(' & ')
        : '';
      if (after === null) what = 'Removed a bingo game that a correction took the win from';
      else if (status === 'open')
        what = `Opened bingo game ${String(field(after, 'number') ?? '')}`.trim();
      else if (status === 'won') what = `Bingo was won${names ? ` by ${names}` : ''}`;
      else
        what = names
          ? `Bingo reached its last week; the closest won: ${names}`
          : 'Bingo reached its last week with nobody paid; the pot carries over';
      break;
    }
    case 'season.status':
      what = text(after, 'status') === 'archived' ? 'Archived the season' : 'Reopened the season';
      break;
    default:
      what = action;
  }
  return { what, where, who: describeActor(record.actorUid, myUid, record) };
}
