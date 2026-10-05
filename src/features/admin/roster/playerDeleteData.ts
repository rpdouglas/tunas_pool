import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../../lib/adminApi';
import { rosterKey } from './rosterData';

/** Asks the server whether this player can be deleted. Fresh every time: it can change in a minute. */
export function usePlayerDeleteCheck(playerId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['playerDeleteCheck', playerId],
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: () => adminApi.checkPlayerDelete({ playerId, dryRun: true }),
  });
}

export function useDeletePlayer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: adminApi.deletePlayer,
    onSuccess: () => client.invalidateQueries({ queryKey: rosterKey }),
  });
}
