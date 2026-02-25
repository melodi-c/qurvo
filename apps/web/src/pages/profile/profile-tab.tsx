import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/api/client';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './profile-tab.translations';

export function ProfileTab() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { t } = useLocalTranslation(translations);

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const updateProfileMutation = useMutation({
    mutationFn: (data: { display_name: string }) => api.authControllerUpdateProfile(data),
    onSuccess: (res) => {
      setUser(res.user);
      setEditingName(false);
      toast.success(t('profileUpdated'));
    },
    onError: () => toast.error(t('updateFailed')),
  });

  const changePasswordMutation = useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) =>
      api.authControllerChangePassword(data),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success(t('passwordChanged'));
    },
    onError: (err) => {
      const data = (err as { response?: { data?: { message?: string } } })?.response?.data;
      const message = data?.message || t('passwordChangeFailed');
      toast.error(message);
    },
  });

  const startEditingName = () => {
    setName(user?.display_name || '');
    setEditingName(true);
  };

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
          <dl className="divide-y divide-border text-sm">
            {/* Name */}
            <div className="flex items-center justify-between px-6 py-3">
              <dt className="text-muted-foreground">{t('name')}</dt>
              <dd className="text-right">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-7 w-48 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && name.trim() && !updateProfileMutation.isPending)
                          updateProfileMutation.mutate({ display_name: name });
                        if (e.key === 'Escape') setEditingName(false);
                      }}
                    />
                    <Button
                      size="xs"
                      onClick={() => updateProfileMutation.mutate({ display_name: name })}
                      disabled={updateProfileMutation.isPending || !name.trim()}
                    >
                      {updateProfileMutation.isPending ? t('saving') : t('save')}
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setEditingName(false)}>
                      {t('cancel')}
                    </Button>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    {user?.display_name}
                    <button
                      onClick={startEditingName}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </dd>
            </div>

            {/* Email */}
            <div className="flex items-center justify-between px-6 py-3">
              <dt className="text-muted-foreground">{t('email')}</dt>
              <dd className="text-muted-foreground">{user?.email}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('changePassword')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">{t('currentPassword')}</Label>
            <Input
              id="current-password"
              type="password"
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
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('confirmPasswordPlaceholder')}
            />
          </div>
          {newPassword && confirmPassword && newPassword !== confirmPassword && (
            <p className="text-xs text-destructive">{t('passwordsMismatch')}</p>
          )}
          <Button
            onClick={() =>
              changePasswordMutation.mutate({
                current_password: currentPassword,
                new_password: newPassword,
              })
            }
            disabled={!canChangePassword || changePasswordMutation.isPending}
          >
            {changePasswordMutation.isPending ? t('changingPassword') : t('changePasswordBtn')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
