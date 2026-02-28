import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { toast } from 'sonner';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import adminUsersPageTranslations from '@/pages/admin/users/admin-users-page.translations';
import adminUserDetailTranslations from '@/pages/admin/users/admin-user-detail.translations';

export function useAdminUsers() {
  const { t } = useLocalTranslation(adminUsersPageTranslations);
  const queryClient = useQueryClient();

  const { data: users, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiClient.admin.adminUsersControllerListUsers(),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, is_staff }: { id: string; is_staff: boolean }) =>
      apiClient.admin.adminUsersControllerPatchUser({ id }, { is_staff }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success(variables.is_staff ? t('promoteSuccess') : t('demoteSuccess'));
    },
    onError: () => toast.error(t('actionFailed')),
  });

  return {
    users,
    isLoading,
    isError,
    refetch,
    patchMutation,
  };
}

export function useAdminUserDetail(id: string | undefined) {
  const { t } = useLocalTranslation(adminUserDetailTranslations);
  const queryClient = useQueryClient();

  const { data: user, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'users', id],
    queryFn: () => apiClient.admin.adminUsersControllerGetUser({ id: id! }),
    enabled: !!id,
  });

  const patchMutation = useMutation({
    mutationFn: (is_staff: boolean) =>
      apiClient.admin.adminUsersControllerPatchUser({ id: id! }, { is_staff }),
    onSuccess: (_data, is_staff) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success(is_staff ? t('promoteSuccess') : t('demoteSuccess'));
    },
    onError: () => toast.error(t('actionFailed')),
  });

  return {
    user,
    isLoading,
    isError,
    refetch,
    patchMutation,
  };
}
