import { useState, useCallback } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';

type InviteRole = 'editor' | 'viewer';

interface UseInviteFormOptions {
  inviteMutation: UseMutationResult<unknown, unknown, { email: string; role: InviteRole }>;
}

interface UseInviteFormReturn {
  showInvite: boolean;
  inviteEmail: string;
  inviteRole: InviteRole;
  setInviteEmail: (email: string) => void;
  setInviteRole: (role: InviteRole) => void;
  openForm: () => void;
  closeForm: () => void;
  handleInvite: () => void;
}

export function useInviteForm({ inviteMutation }: UseInviteFormOptions): UseInviteFormReturn {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteRole>('viewer');

  const openForm = useCallback(() => setShowInvite(true), []);
  const closeForm = useCallback(() => setShowInvite(false), []);

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

  return {
    showInvite,
    inviteEmail,
    inviteRole,
    setInviteEmail,
    setInviteRole,
    openForm,
    closeForm,
    handleInvite,
  };
}
