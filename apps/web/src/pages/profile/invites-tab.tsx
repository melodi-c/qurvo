import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { ProjectMemberRow } from '@/components/project-member-row';
import { Mail } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './invites-tab.translations';
import { useInvites } from '@/features/profile/hooks/use-invites';

export function InvitesTab() {
  const { t } = useLocalTranslation(translations);

  const { invites, isLoading, acceptMutation, declineMutation } = useInvites();

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
