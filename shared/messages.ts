/**
 * The ready-made messages for reminders and sharing (PROJECT_PLAN Sprint 8). Pure, so the wording
 * is tested. Rules they follow:
 * - Friendly and plain, no jargon (DESIGN_SYSTEM §8).
 * - A payment message is neutral, never a demand, and never mentions anyone else (PERSONAS: Jen,
 *   Rosalie). It is only ever sent by the commissioner tapping a button (D-027).
 * - Anything a player shares is safe to screenshot: a first name or display name, the week, and
 *   that picks are in. Never a pick before the lock, never a phone, email, or payment (PERSONAS:
 *   Kayla).
 */
import { formatPoolDateTime } from './time';

export const POOL_URL = 'https://tunaspool.web.app';

const fee = (cents: number) => `$${(cents / 100).toFixed(0)}`;
const firstName = (displayName: string) => displayName.trim().split(/\s+/)[0] || 'there';

export interface MessageWeek {
  weekNumber: number;
  lockAtMs: number;
  entryFeeCents: number;
}

/** To one player who hasn't entered yet. */
export function entryReminder(displayName: string, week: MessageWeek): string {
  return `Hi ${firstName(displayName)}, it's the Tunas pool. Week ${week.weekNumber} picks lock ${formatPoolDateTime(new Date(week.lockAtMs), { weekday: 'long' })}. You can make them at ${POOL_URL} or drop your sheet at the shop. Good luck!`;
}

/** For the group chat: nobody is named. */
export function groupReminder(week: MessageWeek): string {
  return `Tunas pool: week ${week.weekNumber} picks lock ${formatPoolDateTime(new Date(week.lockAtMs), { weekday: 'long' })}. ${fee(week.entryFeeCents)} to enter. Make your picks at ${POOL_URL} or drop your sheet at the shop.`;
}

/** To one player whose entry isn't marked paid. Neutral: it may simply not be recorded yet. */
export function paymentReminder(
  displayName: string,
  week: MessageWeek,
  etransferEmail: string,
): string {
  return `Hi ${firstName(displayName)}, it's the Tunas pool. Your week ${week.weekNumber} picks are in. I don't have your ${fee(week.entryFeeCents)} marked yet: cash at the shop, or e-Transfer to ${etransferEmail}, before picks lock ${formatPoolDateTime(new Date(week.lockAtMs), { weekday: 'long' })}. If you've already paid, just let me know. Thanks!`;
}

/** What a player shares after submitting. No picks, ever, before the lock. */
export function picksInMessage(displayName: string, week: MessageWeek): string {
  return `${displayName} is in for week ${week.weekNumber} of the Tunas pool. Picks lock ${formatPoolDateTime(new Date(week.lockAtMs), { weekday: 'long' })}. Get yours in: ${POOL_URL}`;
}

/** "Share this pool": an invitation for a group chat. */
export function sharePoolMessage(week: MessageWeek | null): string {
  const base = `Join the Tunas Weekly Football Pool. Pick the winners of Sunday's games and Monday night, most right takes the pot.`;
  return week
    ? `${base} ${fee(week.entryFeeCents)} a week, and week ${week.weekNumber} picks lock ${formatPoolDateTime(new Date(week.lockAtMs), { weekday: 'long' })}. ${POOL_URL}`
    : `${base} ${POOL_URL}`;
}

/** A link that opens the phone's text app with the message filled in. Works on iPhone and Android. */
export function smsLink(e164: string, body: string): string {
  return `sms:${e164}?&body=${encodeURIComponent(body)}`;
}
