import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { api } from '@/api/client';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';

export function InvitesTab() {
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
      toast.success('Invite accepted');
    },
    onError: () => toast.error('Failed to accept invite'),
  });

  const declineMutation = useMutation({
    mutationFn: (inviteId: string) => api.myInvitesControllerDeclineInvite({ inviteId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myInvites'] });
      toast.success('Invite declined');
    },
    onError: () => toast.error('Failed to decline invite'),
  });

  return (
    <div>
      {isLoading && <ListSkeleton count={2} />}

      {!isLoading && (!invites || invites.length === 0) && (
        <EmptyState icon={Mail} description="No pending invites" />
      )}

      <div className="space-y-3 max-w-2xl">
        {(invites || []).map((invite) => (
          <Card key={invite.id}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{invite.project.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Invited by {invite.invited_by.display_name} as{' '}
                    <span className="capitalize">{invite.role}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => acceptMutation.mutate(invite.id)}
                    disabled={acceptMutation.isPending || declineMutation.isPending}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => declineMutation.mutate(invite.id)}
                    disabled={acceptMutation.isPending || declineMutation.isPending}
                  >
                    Decline
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
