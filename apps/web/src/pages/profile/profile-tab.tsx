import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InlineEditField } from '@/components/ui/inline-edit-field';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/api/client';
import { DefinitionList, DefinitionListRow } from '@/components/ui/definition-list';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useMutationWithToast } from '@/hooks/use-mutation-with-toast';
import translations from './profile-tab.translations';

export function ProfileTab() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { t } = useLocalTranslation(translations);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const updateProfileMutation = useMutationWithToast(
    (data: { display_name: string }) => api.authControllerUpdateProfile(data),
    {
      successMessage: t('profileUpdated'),
      errorMessage: t('updateFailed'),
      onSuccess: (res) => setUser(res.user),
    },
  );

  const changePasswordMutation = useMutationWithToast(
    (data: { current_password: string; new_password: string }) =>
      api.authControllerChangePassword(data),
    {
      successMessage: t('passwordChanged'),
      errorMessage: t('passwordChangeFailed'),
      onSuccess: () => {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      },
    },
  );

  const canChangePassword =
    currentPassword.length >= 8 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword;

  return (
    <div className="space-y-6 max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('profileDetails')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DefinitionList>
            {/* Name */}
            <DefinitionListRow label={t('name')}>
              <span className="text-right">
                <InlineEditField
                  value={user?.display_name ?? ''}
                  onSave={(display_name) => updateProfileMutation.mutate({ display_name })}
                  isPending={updateProfileMutation.isPending}
                  saveLabel={t('save')}
                  savingLabel={t('saving')}
                  cancelLabel={t('cancel')}
                />
              </span>
            </DefinitionListRow>

            {/* Email */}
            <DefinitionListRow label={t('email')}>
              <span className="text-muted-foreground">{user?.email}</span>
            </DefinitionListRow>
          </DefinitionList>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('changePassword')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              changePasswordMutation.mutate({
                current_password: currentPassword,
                new_password: newPassword,
              });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="current-password">{t('currentPassword')}</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t('currentPasswordPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">{t('newPassword')}</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('newPasswordPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t('confirmPassword')}</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('confirmPasswordPlaceholder')}
              />
            </div>
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-destructive">{t('passwordsMismatch')}</p>
            )}
            <Button
              type="submit"
              disabled={!canChangePassword || changePasswordMutation.isPending}
            >
              {changePasswordMutation.isPending ? t('changingPassword') : t('changePasswordBtn')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
