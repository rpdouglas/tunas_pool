import { useQuery } from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

/**
 * Whether this login is a Tunas 649 Bingo member, for the menu link (D-135). Asked only for a saved
 * account with a profile (members need both, D-115), so guests never call it; it shares the bingo
 * screens' cache key, so opening bingo after this costs nothing. Anyone else never sees bingo.
 */
export function useBingoMember(uid: string | undefined, ask: boolean): boolean {
  const status = useQuery({
    queryKey: ['bingo', 'status', uid ?? ''],
    enabled: ask && Boolean(uid),
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async () =>
      (await httpsCallable<void, { member: boolean }>(functions, 'bingoStatus')()).data,
  });
  return status.data?.member === true;
}
