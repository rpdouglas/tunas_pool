/**
 * Picks saved on the device from the first tap (PERSONAS: Dale, Troy), so a dropped connection or a
 * closed tab never loses them. Drafts are per week and cleared after a successful submit. The
 * player's name, phone, and usual payment are remembered separately for next week's form.
 */
import type { PaymentIntent, PaymentMethod, Pick as PickSide } from '@shared/types';

export interface EntryDraft {
  picks: Record<string, PickSide>;
  tiebreaker: string;
  displayName: string;
  phone: string;
  paymentMethod: PaymentMethod | null;
  paymentIntent: PaymentIntent | null;
}

export type RememberedPlayer = Pick<EntryDraft, 'displayName' | 'phone' | 'paymentMethod'>;

const draftKey = (year: string, weekId: string) => `tunas.draft.${year}:${weekId}`;
const ME_KEY = 'tunas.me';

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing or full storage: the form still works, it just won't survive a reload.
  }
}

export const loadDraft = (year: string, weekId: string) => read<EntryDraft>(draftKey(year, weekId));
export const saveDraft = (year: string, weekId: string, draft: EntryDraft) =>
  write(draftKey(year, weekId), draft);
export const clearDraft = (year: string, weekId: string) => write(draftKey(year, weekId), null);

export const loadRemembered = () => read<RememberedPlayer>(ME_KEY);
export const saveRemembered = (me: RememberedPlayer) => write(ME_KEY, me);
