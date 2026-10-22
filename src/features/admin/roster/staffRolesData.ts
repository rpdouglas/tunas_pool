import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../../lib/adminApi';

export const staffRolesKey = ['staffRoles'] as const;

/** Who on the roster is a counter or an admin (D-140). Roles live on logins, so the server answers. */
export function useStaffRoles() {
  return useQuery({
    queryKey: staffRolesKey,
    queryFn: () => adminApi.listStaffRoles({}),
    refetchOnMount: 'always',
  });
}

export function useSetStaffRole() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: adminApi.setStaffRole,
    onSuccess: () => client.invalidateQueries({ queryKey: staffRolesKey }),
  });
}
