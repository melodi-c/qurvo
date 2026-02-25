import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { ProjectMemberRow } from '@/components/project-member-row';
import { api } from '@/api/client';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './invites-tab.translations';

export function InvitesTab() {
  const { t } = useLocalTranslation(translations);
  const queryClient = useQueryClient();

  const { data: invites, isLoading } = useQuery({
    queryKey: ['myInvites'],
    queryFn: () => api.myInvitesControllerGetMyInvites(),
  });

  const acceptMutation = useMutation({
    mutationFn: (inviteId: string) => api.myInvitesControllerAcceptInvite({ inviteId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myInvites'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(t('acceptSuccess'));
    },
    onError: () => toast.error(t('acceptError')),
  });

  const declineMutation = useMutation({
    mutationFn: (inviteId: string) => api.myInvitesControllerDeclineInvite({ inviteId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myInvites'] });
      toast.success(t('declineSuccess'));
    },
    onError: () => toast.error(t('declineError')),
  });

  return (
    <div>
      {isLoading && <ListSkeleton count={2} />}

      {!isLoading && (!invites || invites.length === 0) && (
        <EmptyState icon={Mail} description={t('noPending')} />
      )}

      <div className="space-y-3 max-w-2xl">
        {(invites || []).map((invite) => (
          <Card key={invite.id}>
            <CardContent className="pt-6">
              <ProjectMemberRow
                name={invite.project.name}
                subtitle={<>{t('invitedBy', { name: invite.invited_by.display_name })} <span className="capitalize">{invite.role}</span></>}
                className="px-0 py-0"
                actions={
                  <>
                    <Button
                      size="sm"
                      onClick={() => acceptMutation.mutate(invite.id)}
                      disabled={acceptMutation.isPending || declineMutation.isPending}
                    >
                      {t('accept')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => declineMutation.mutate(invite.id)}
                      disabled={acceptMutation.isPending || declineMutation.isPending}
                    >
                      {t('decline')}
                    </Button>
                  </>
                }
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
