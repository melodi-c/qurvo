import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { ConfirmDialog, useConfirmDelete } from '@/components/ui/confirm-dialog';
import { Users, UserPlus, Mail, Trash2 } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './members-tab.translations';
import { useMembers } from './use-members';

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

  // ── Invite form ──
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');

  const handleInvite = useCallback(() => {
    inviteMutation.mutate(
      { email: inviteEmail, role: inviteRole },
      {
        onSuccess: () => {
          setShowInvite(false);
          setInviteEmail('');
          setInviteRole('viewer');
        },
      },
    );
  }, [inviteMutation, inviteEmail, inviteRole]);

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
      {/* Invite button */}
      {isOwner && (
        <div>
          {showInvite ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground">{t('email')}</label>
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="w-32 space-y-1">
                    <label className="text-xs text-muted-foreground">{t('role')}</label>
                    <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'editor' | 'viewer')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="editor">{t('editor')}</SelectItem>
                        <SelectItem value="viewer">{t('viewer')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleInvite}
                    disabled={inviteMutation.isPending || !inviteEmail.trim()}
                  >
                    {inviteMutation.isPending ? t('sending') : t('sendInvite')}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowInvite(false)}>
                    {t('cancel')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button onClick={() => setShowInvite(true)}>
              <UserPlus className="h-4 w-4 mr-2" /> {t('inviteMember')}
            </Button>
          )}
        </div>
      )}

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
                <div key={member.id} className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/15 text-xs font-bold text-primary">
                      {member.user.display_name.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{member.user.display_name}</p>
                      <p className="text-xs text-muted-foreground">{member.user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.role === 'owner' ? (
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
                    )}
                  </div>
                </div>
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
                <div key={invite.id} className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm">{invite.email}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {invite.role} &middot; {t('invited')} {new Date(invite.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {isOwner && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => cancelInviteMutation.mutate(invite.id)}
                      disabled={cancellingInviteId === invite.id}
                    >
                      {cancellingInviteId === invite.id ? t('cancelling') : t('cancelInvite')}
                    </Button>
                  )}
                </div>
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
