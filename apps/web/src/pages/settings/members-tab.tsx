import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { ConfirmDialog, useConfirmDelete } from '@/components/ui/confirm-dialog';
import { api } from '@/api/client';
import { toast } from 'sonner';
import { Users, UserPlus, Mail, Trash2 } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './members-tab.translations';

export function MembersTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { t } = useLocalTranslation(translations);

  // Current project to check if user is owner
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projectsControllerGetById({ id: projectId }),
    enabled: !!projectId,
  });

  const isOwner = project?.role === 'owner';

  // ── Members list ──
  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ['members', projectId],
    queryFn: () => api.membersControllerListMembers({ projectId }),
    enabled: !!projectId,
  });

  // ── Pending invites ──
  const { data: invites, isLoading: invitesLoading } = useQuery({
    queryKey: ['invites', projectId],
    queryFn: () => api.invitesControllerListInvites({ projectId }),
    enabled: !!projectId,
  });

  const pendingInvites = (invites || []).filter((i) => i.status === 'pending');

  // ── Invite form ──
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');

  const inviteMutation = useMutation({
    mutationFn: () => api.invitesControllerCreateInvite({ projectId }, { email: inviteEmail, role: inviteRole }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites', projectId] });
      setShowInvite(false);
      setInviteEmail('');
      setInviteRole('viewer');
      toast.success(t('inviteSent'));
    },
    onError: (err: any) => {
      const message = err?.error?.message || t('inviteFailed');
      toast.error(message);
    },
  });

  // ── Role change (per-row tracking) ──
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: 'editor' | 'viewer' }) =>
      api.membersControllerUpdateRole({ projectId, memberId }, { role }),
    onMutate: ({ memberId }) => setUpdatingRoleId(memberId),
    onSettled: () => setUpdatingRoleId(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', projectId] });
      toast.success(t('roleUpdated'));
    },
    onError: () => toast.error(t('roleUpdateFailed')),
  });

  // ── Remove member ──
  const removeMutation = useMutation({
    mutationFn: (memberId: string) => api.membersControllerRemoveMember({ projectId, memberId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', projectId] });
      toast.success(t('removed'));
    },
    onError: () => toast.error(t('removeFailed')),
  });

  const confirmDelete = useConfirmDelete();

  const handleRemove = useCallback(async () => {
    await removeMutation.mutateAsync(confirmDelete.itemId);
  }, [confirmDelete.itemId, removeMutation]);

  // ── Cancel invite (per-row tracking) ──
  const [cancellingInviteId, setCancellingInviteId] = useState<string | null>(null);
  const cancelInviteMutation = useMutation({
    mutationFn: (inviteId: string) => api.invitesControllerCancelInvite({ projectId, inviteId }),
    onMutate: (inviteId) => setCancellingInviteId(inviteId),
    onSettled: () => setCancellingInviteId(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites', projectId] });
      toast.success(t('inviteCancelled'));
    },
    onError: () => toast.error(t('cancelFailed')),
  });

  if (!projectId) {
    return <EmptyState icon={Users} description={t('selectProject')} />;
  }

  const isLoading = membersLoading || invitesLoading;

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
                    onClick={() => inviteMutation.mutate()}
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
            <CardTitle className="text-sm">{t('members')} ({(members || []).length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {(members || []).map((member) => (
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
