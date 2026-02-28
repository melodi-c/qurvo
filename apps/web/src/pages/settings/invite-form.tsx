import { useState, useCallback } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './invite-form.translations';

type InviteRole = 'editor' | 'viewer';

interface InviteFormProps {
  inviteMutation: UseMutationResult<unknown, unknown, { email: string; role: InviteRole }>;
}

export function InviteForm({ inviteMutation }: InviteFormProps) {
  const { t } = useLocalTranslation(translations);
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleInvite();
          }}
          className="flex items-end gap-3"
        >
          <div className="flex-1 space-y-1">
            <Label htmlFor="invite-email" className="text-xs text-muted-foreground">{t('email')}</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder={t('emailPlaceholder')}
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              autoFocus
            />
          </div>
          <div className="w-32 space-y-1">
            <Label htmlFor="invite-role" className="text-xs text-muted-foreground">{t('role')}</Label>
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as InviteRole)}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">{t('editor')}</SelectItem>
                <SelectItem value="viewer">{t('viewer')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            disabled={inviteMutation.isPending || !inviteEmail.trim()}
          >
            {inviteMutation.isPending ? t('sending') : t('sendInvite')}
          </Button>
          <Button type="button" variant="ghost" onClick={closeForm}>
            {t('cancel')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
