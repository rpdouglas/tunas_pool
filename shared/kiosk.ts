import type { PaymentIntent, PaymentMethod, Pick } from './types';

export interface KioskRosterPlayer {
  playerId: string;
  displayName: string;
  hasPin: boolean;
}

export interface KioskExistingEntry {
  picks: Record<string, Pick>;
  tiebreakerTotal: number;
  paymentMethod?: PaymentMethod | null;
  paymentIntent?: PaymentIntent | null;
}

export interface KioskVerifyPinInput {
  playerId: string;
  pin: string;
  year?: string;
  weekId?: string;
}

export interface KioskVerifyPinResult {
  valid: boolean;
  needsPinSetup?: boolean;
  locked?: boolean;
  remainingAttempts?: number;
  message?: string;
  existingEntry?: KioskExistingEntry | null;
}

export interface KioskSetPinInput {
  playerId: string;
  currentPin: string | null;
  newPin: string;
}

export interface KioskRegisterInput {
  displayName: string;
  phoneOrEmail: string;
  pin: string;
}

export interface KioskRegisterResult {
  playerId: string;
  displayName: string;
}

export interface KioskSubmitInput {
  year: string;
  weekId: string;
  playerId: string;
  pin: string;
  picks: Record<string, Pick>;
  tiebreakerTotal: number;
  paymentMethod: PaymentMethod;
  paymentIntent: PaymentIntent;
}

export interface KioskSubmitResult {
  playerId: string;
  picksSubmittedAtMs: number;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin.trim());
}
