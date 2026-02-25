import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineCreateForm } from '@/components/ui/inline-create-form';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { api } from '@/api/client';
import { Plus, Key, Copy, Check } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { STATUS_COLORS } from '@/lib/chart-colors';
import translations from './api-keys-tab.translations';

export function ApiKeysTab({ projectId }: { projectId: string }) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();
  const { t } = useLocalTranslation(translations);
  const confirmRevoke = useConfirmDelete();

  const { data: keys, isLoading } = useQuery({
    queryKey: ['apiKeys', projectId],
    queryFn: () => api.apiKeysControllerList({ projectId }),
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string }) => api.apiKeysControllerCreate({ projectId }, data),
    onSuccess: (data) => {
      setCreatedKey(data.key);
      queryClient.invalidateQueries({ queryKey: ['apiKeys', projectId] });
      setShowCreate(false);
      setName('');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => api.apiKeysControllerRevoke({ projectId, keyId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apiKeys', projectId] }),
  });

  const handleRevoke = useCallback(async () => {
    await revokeMutation.mutateAsync(confirmRevoke.itemId);
  }, [confirmRevoke.itemId, revokeMutation]);

  const copyKey = async () => {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!projectId) {
    return <EmptyState icon={Key} description={t('selectProject')} />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Button onClick={() => setShowCreate(true)}>
        <Plus className="h-4 w-4 mr-2" /> {t('newKey')}
      </Button>

      {createdKey && (
        <Card className={STATUS_COLORS.successBorder}>
          <CardContent className="pt-6">
            <p className={`text-sm ${STATUS_COLORS.successText} mb-2`}>{t('keyCreated')}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted p-3 rounded text-sm break-all">{createdKey}</code>
              <Button size="icon" variant="outline" onClick={copyKey}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setCreatedKey(null)}>{t('dismiss')}</Button>
          </CardContent>
        </Card>
      )}

      {showCreate && (
        <InlineCreateForm
          placeholder={t('placeholder')}
          value={name}
          onChange={setName}
          isPending={createMutation.isPending}
          onSubmit={() => createMutation.mutate({ name })}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {isLoading && <ListSkeleton count={2} height="h-20" />}

      <div className="space-y-3">
        {(keys || []).map((key) => (
          <Card key={key.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-sm">{key.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {key.key_prefix}... &middot; {t('created')} {new Date(key.created_at).toLocaleDateString()}
                      {key.revoked_at && <span className={`${STATUS_COLORS.negative} ml-2`}>{t('revoked')}</span>}
                    </p>
                  </div>
                </div>
                {!key.revoked_at && (
                  <Button size="sm" variant="destructive" onClick={() => confirmRevoke.requestDelete(key.id, key.name)}>
                    {t('revoke')}
                  </Button>
                )}
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={confirmRevoke.isOpen}
        onOpenChange={confirmRevoke.close}
        title={t('revokeTitle', { name: confirmRevoke.itemName })}
        description={t('revokeDescription')}
        confirmLabel={t('revokeConfirm')}
        onConfirm={handleRevoke}
      />
    </div>
  );
}
