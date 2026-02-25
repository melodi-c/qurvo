import type { UseMutationResult } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './invite-form.translations';
import { useInviteForm } from './use-invite-form';

type InviteRole = 'editor' | 'viewer';

interface InviteFormProps {
  inviteMutation: UseMutationResult<unknown, unknown, { email: string; role: InviteRole }>;
}

export function InviteForm({ inviteMutation }: InviteFormProps) {
  const { t } = useLocalTranslation(translations);

  const {
    showInvite,
    inviteEmail,
    inviteRole,
    setInviteEmail,
    setInviteRole,
    openForm,
    closeForm,
    handleInvite,
  } = useInviteForm({ inviteMutation });

  if (!showInvite) {
    return (
      <Button onClick={openForm}>
        <UserPlus className="h-4 w-4 mr-2" /> {t('inviteMember')}
      </Button>
    );
  }

  return (
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
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as InviteRole)}>
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
          <Button variant="ghost" onClick={closeForm}>
            {t('cancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
