import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { api } from '@/api/client';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './invites.translations';

export default function InvitesPage() {
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
      toast.success(t('accepted'));
    },
    onError: () => toast.error(t('acceptFailed')),
  });

  const declineMutation = useMutation({
    mutationFn: (inviteId: string) => api.myInvitesControllerDeclineInvite({ inviteId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myInvites'] });
      toast.success(t('declined'));
    },
    onError: () => toast.error(t('declineFailed')),
  });

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      {isLoading && <ListSkeleton count={2} />}

      {!isLoading && (!invites || invites.length === 0) && (
        <EmptyState icon={Mail} description={t('noInvites')} />
      )}

      <div className="space-y-3 max-w-2xl">
        {(invites || []).map((invite) => (
          <Card key={invite.id}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{invite.project.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('invitedBy', { name: invite.invited_by.display_name })} <span className="capitalize">{invite.role}</span>
                  </p>
                </div>
                <div className="flex gap-2">
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
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
