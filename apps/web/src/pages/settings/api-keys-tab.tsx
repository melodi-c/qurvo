import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { api } from '@/api/client';
import { toast } from 'sonner';
import { Key, Copy, Check } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { STATUS_COLORS } from '@/lib/chart-colors';
import { formatRelativeTime } from '@/lib/formatting';
import { CreateApiKeyForm } from './create-api-key-form';
import translations from './api-keys-tab.translations';

export function ApiKeysTab({ projectId }: { projectId: string }) {
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const { copied, copy } = useCopyToClipboard(2000, () => toast.error(t('copyFailed')));
  const queryClient = useQueryClient();
  const { t } = useLocalTranslation(translations);
  const confirmRevoke = useConfirmDelete();

  const { data: keys, isLoading } = useQuery({
    queryKey: ['apiKeys', projectId],
    queryFn: () => api.apiKeysControllerList({ projectId }),
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.apiKeysControllerCreate>[1]) =>
      api.apiKeysControllerCreate({ projectId }, data),
    onSuccess: (data) => {
      setCreatedKey(data.key);
      queryClient.invalidateQueries({ queryKey: ['apiKeys', projectId] });
    },
    onError: () => toast.error(t('createFailed')),
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => api.apiKeysControllerRevoke({ projectId, keyId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apiKeys', projectId] }),
    onError: () => toast.error(t('revokeFailed')),
  });

  const handleRevoke = useCallback(async () => {
    await revokeMutation.mutateAsync(confirmRevoke.itemId);
  }, [confirmRevoke.itemId, revokeMutation]);

  return (
    <div className="space-y-6 max-w-2xl">
      <CreateApiKeyForm createMutation={createMutation} />

      {createdKey && (
        <Card className={STATUS_COLORS.successBorder}>
          <CardContent className="pt-6">
            <p className={`text-sm ${STATUS_COLORS.successText} mb-2`}>{t('keyCreated')}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted p-3 rounded text-sm break-all">{createdKey}</code>
              <Button size="icon" variant="outline" onClick={() => copy(createdKey)}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setCreatedKey(null)}>{t('dismiss')}</Button>
          </CardContent>
        </Card>
      )}

      {isLoading && <ListSkeleton count={2} height="h-20" />}

      <div className="space-y-3">
        {(keys || []).map((key) => (
          <Card key={key.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <div className="space-y-1">
                    <CardTitle className="text-sm">{key.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {key.key_prefix}... &middot; {t('created')} {new Date(key.created_at).toLocaleDateString()}
                      {key.revoked_at && <span className={`${STATUS_COLORS.negative} ml-2`}>{t('revoked')}</span>}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {key.scopes && key.scopes.length > 0 ? (
                        key.scopes.map((scope) => (
                          <Badge key={scope} variant="secondary" className="text-xs">
                            {scope}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          {t('noScopes')}
                        </Badge>
                      )}
                      {key.expires_at && (
                        <span className="text-xs text-muted-foreground">
                          {t('expires')} {new Date(key.expires_at).toLocaleDateString()}
                        </span>
                      )}
                      {key.last_used_at && (
                        <span className="text-xs text-muted-foreground">
                          {t('lastUsed')} {formatRelativeTime(key.last_used_at)}
                        </span>
                      )}
                    </div>
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
