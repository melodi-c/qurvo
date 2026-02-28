import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toast } from 'sonner';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from '@/pages/profile/invites-tab.translations';

export function useInvites() {
  const { t } = useLocalTranslation(translations);
  const queryClient = useQueryClient();

  const { data: invites, isLoading } = useQuery({
    queryKey: ['myInvites'],
    queryFn: () => api.myInvitesControllerGetMyInvites(),
  });

  const acceptMutation = useMutation({
    mutationFn: (inviteId: string) => api.myInvitesControllerAcceptInvite({ inviteId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['myInvites'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(t('acceptSuccess'));
    },
    onError: () => toast.error(t('acceptError')),
  });

  const declineMutation = useMutation({
    mutationFn: (inviteId: string) => api.myInvitesControllerDeclineInvite({ inviteId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['myInvites'] });
      toast.success(t('declineSuccess'));
    },
    onError: () => toast.error(t('declineError')),
  });

  return {
    invites,
    isLoading,
    acceptMutation,
    declineMutation,
  };
}
