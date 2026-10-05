/**
 * config/pool: public-safe pool settings (DATA_MODEL §3.9). Admin-written, readable by players.
 * Not audit logged: these are display settings, not money or entries.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { PoolConfig } from '@shared/types';
import { DEFAULT_ENTRY_FEE_CENTS } from '@shared/weeks';
import { db } from '../../../lib/firebase';
import { DEFAULT_CONTACT_EMAIL, entryKeys } from '../../entry/entryData';

/** Starting values, from the confirmed decisions (D-008, D-009, D-011, D-039). */
export const POOL_CONFIG_DEFAULTS: PoolConfig = {
  entryFeeCents: DEFAULT_ENTRY_FEE_CENTS,
  etransferEmail: DEFAULT_CONTACT_EMAIL,
  etransferInstructions: '',
  contactEmail: DEFAULT_CONTACT_EMAIL,
  defaultLockRule: 'Saturday 23:59 America/Toronto',
  tieGameRule: 'no_win',
  unpaidEligibleToWin: false,
};

const configRef = () => doc(db, 'config', 'pool');

export function useAdminPoolConfig() {
  return useQuery({
    queryKey: ['adminPoolConfig'],
    queryFn: async (): Promise<{ config: PoolConfig; saved: boolean }> => {
      const snap = await getDoc(configRef());
      return {
        config: { ...POOL_CONFIG_DEFAULTS, ...(snap.data() as Partial<PoolConfig> | undefined) },
        saved: snap.exists(),
      };
    },
  });
}

export function useSavePoolConfig() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (config: PoolConfig) => setDoc(configRef(), config),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['adminPoolConfig'] }),
        client.invalidateQueries({ queryKey: entryKeys.config }),
      ]),
  });
}
