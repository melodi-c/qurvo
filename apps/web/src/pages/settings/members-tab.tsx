import { useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ProjectMemberRow } from '@/components/project-member-row';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { Users, Mail, Trash2 } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './members-tab.translations';
import { useMembers } from './use-members';
import { InviteForm } from './invite-form';

export function MembersTab({ projectId }: { projectId: string }) {
  const { t } = useLocalTranslation(translations);

  const {
    isOwner,
    members,
    pendingInvites,
    isLoading,
    inviteMutation,
    updateRoleMutation,
    updatingRoleId,
    handleRemoveMember,
    cancelInviteMutation,
    cancellingInviteId,
  } = useMembers(projectId);

  // ── Remove member confirm ──
  const confirmDelete = useConfirmDelete();

  const handleRemove = useCallback(async () => {
    await handleRemoveMember(confirmDelete.itemId);
  }, [confirmDelete.itemId, handleRemoveMember]);

  if (!projectId) {
    return <EmptyState icon={Users} description={t('selectProject')} />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Invite form */}
      {isOwner && <InviteForm inviteMutation={inviteMutation} />}

      {isLoading && <ListSkeleton count={3} />}

      {/* Members list */}
      {!isLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('members')} ({members.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {members.map((member) => (
                <ProjectMemberRow
                  key={member.id}
                  avatar={
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/15 text-xs font-bold text-primary">
                      {member.user.display_name.slice(0, 1).toUpperCase()}
                    </span>
                  }
                  name={member.user.display_name}
                  subtitle={member.user.email}
                  actions={
                    member.role === 'owner' ? (
                      <span className="text-xs text-muted-foreground capitalize px-2 py-1 bg-muted rounded">{t('owner')}</span>
                    ) : isOwner ? (
                      <>
                        <Select
                          value={member.role}
                          onValueChange={(role) =>
                            updateRoleMutation.mutate({ memberId: member.id, role: role as 'editor' | 'viewer' })
                          }
                          disabled={updatingRoleId === member.id}
                        >
                          <SelectTrigger className="w-24 h-8" size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="editor">{t('editor')}</SelectItem>
                            <SelectItem value="viewer">{t('viewer')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => confirmDelete.requestDelete(member.id, member.user.display_name)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground capitalize px-2 py-1 bg-muted rounded">{member.role}</span>
                    )
                  }
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending invites */}
      {!isLoading && pendingInvites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('pendingInvites')} ({pendingInvites.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {pendingInvites.map((invite) => (
                <ProjectMemberRow
                  key={invite.id}
                  avatar={<Mail className="h-4 w-4 text-muted-foreground" />}
                  name={invite.email}
                  subtitle={<><span className="capitalize">{invite.role}</span> &middot; {t('invited')} {new Date(invite.created_at).toLocaleDateString()}</>}
                  actions={
                    isOwner ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => cancelInviteMutation.mutate(invite.id)}
                        disabled={cancellingInviteId === invite.id}
                      >
                        {cancellingInviteId === invite.id ? t('cancelling') : t('cancelInvite')}
                      </Button>
                    ) : undefined
                  }
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete.isOpen}
        onOpenChange={confirmDelete.close}
        title={t('removeTitle', { name: confirmDelete.itemName })}
        description={t('removeDescription')}
        confirmLabel={t('remove')}
        onConfirm={handleRemove}
      />
    </div>
  );
}
