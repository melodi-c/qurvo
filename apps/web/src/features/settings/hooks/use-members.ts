import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toast } from 'sonner';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from '@/pages/settings/members-tab.translations';

export function useMembers(projectId: string) {
  const { t } = useLocalTranslation(translations);
  const queryClient = useQueryClient();

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projectsControllerGetById({ id: projectId }),
    enabled: !!projectId,
  });

  const isOwner = project?.role === 'owner';

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ['members', projectId],
    queryFn: () => api.membersControllerListMembers({ projectId }),
    enabled: !!projectId,
  });

  const { data: invites, isLoading: invitesLoading } = useQuery({
    queryKey: ['invites', projectId],
    queryFn: () => api.invitesControllerListInvites({ projectId }),
    enabled: !!projectId,
  });

  const pendingInvites = (invites || []).filter((i) => i.status === 'pending');
  const isLoading = membersLoading || invitesLoading;

  // ── Invite mutation ──
  const inviteMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role: 'editor' | 'viewer' }) =>
      api.invitesControllerCreateInvite({ projectId }, { email, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites', projectId] });
      toast.success(t('inviteSent'));
    },
    onError: (err) => {
      const data = (err as { response?: { data?: { message?: string } } })?.response?.data;
      const message = data?.message || t('inviteFailed');
      toast.error(message);
    },
  });

  // ── Role update mutation (per-row tracking) ──
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

  // ── Remove member mutation ──
  const removeMutation = useMutation({
    mutationFn: (memberId: string) => api.membersControllerRemoveMember({ projectId, memberId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', projectId] });
      toast.success(t('removed'));
    },
    onError: () => toast.error(t('removeFailed')),
  });

  // ── Cancel invite mutation (per-row tracking) ──
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

  return {
    isOwner,
    members: members || [],
    pendingInvites,
    isLoading,
    inviteMutation,
    updateRoleMutation,
    updatingRoleId,
    removeMutation,
    cancelInviteMutation,
    cancellingInviteId,
  };
}
