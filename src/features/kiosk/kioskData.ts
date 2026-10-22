import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { db, functions } from '../../lib/firebase';
import type {
  KioskRegisterInput,
  KioskRegisterResult,
  KioskRosterPlayer,
  KioskSetPinInput,
  KioskSubmitInput,
  KioskSubmitResult,
  KioskVerifyPinInput,
  KioskVerifyPinResult,
} from '@shared/kiosk';

export const kioskKeys = {
  roster: ['kioskRoster'] as const,
  entry: (year: string, weekId: string, playerId: string) => ['kioskEntry', year, weekId, playerId] as const,
};

export function useKioskRoster() {
  return useQuery({
    queryKey: kioskKeys.roster,
    queryFn: async (): Promise<KioskRosterPlayer[]> => {
      const fn = httpsCallable<void, KioskRosterPlayer[]>(functions, 'kioskRoster');
      const res = await fn();
      return res.data;
    },
    staleTime: 30_000,
  });
}

export function useVerifyKioskPin() {
  return useMutation({
    mutationFn: async (input: KioskVerifyPinInput): Promise<KioskVerifyPinResult> => {
      const fn = httpsCallable<KioskVerifyPinInput, KioskVerifyPinResult>(functions, 'kioskVerifyPin');
      const res = await fn(input);
      return res.data;
    },
  });
}

export function useSetKioskPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: KioskSetPinInput): Promise<{ success: boolean }> => {
      const fn = httpsCallable<KioskSetPinInput, { success: boolean }>(functions, 'kioskSetPin');
      const res = await fn(input);
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: kioskKeys.roster });
    },
  });
}

export function useRegisterKioskPlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: KioskRegisterInput): Promise<KioskRegisterResult> => {
      const fn = httpsCallable<KioskRegisterInput, KioskRegisterResult>(functions, 'kioskRegisterPlayer');
      const res = await fn(input);
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: kioskKeys.roster });
    },
  });
}

export function useSubmitKioskEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: KioskSubmitInput): Promise<KioskSubmitResult> => {
      const fn = httpsCallable<KioskSubmitInput, KioskSubmitResult>(functions, 'kioskSubmitEntry');
      const res = await fn(input);
      return res.data;
    },
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: kioskKeys.entry(vars.year, vars.weekId, vars.playerId) });
    },
  });
}

export function useResetKioskPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { playerId: string }): Promise<{ success: boolean }> => {
      const fn = httpsCallable<{ playerId: string }, { success: boolean }>(functions, 'counterResetPlayerPin');
      const res = await fn(input);
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: kioskKeys.roster });
    },
  });
}

export function useKioskPlayerEntry(year: string, weekId: string, playerId: string | null) {
  return useQuery({
    queryKey: kioskKeys.entry(year, weekId, playerId || ''),
    enabled: Boolean(year && weekId && playerId),
    queryFn: async () => {
      if (!playerId) return null;
      const ref = doc(db, 'seasons', year, 'weeks', weekId, 'entries', playerId);
      const snap = await getDoc(ref);
      return snap.exists() ? snap.data() : null;
    },
  });
}
