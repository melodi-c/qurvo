import { useState, useCallback } from 'react';
import { Link2, Plus, Trash2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './share-dialog.translations';
import { formatDate } from '@/lib/formatting';
import type { ShareToken } from '@/api/generated/Api';
import { routes } from '@/lib/routes';

type ResourceType = 'dashboard' | 'insight';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType: ResourceType;
  resourceId: string;
  projectId: string;
}

function buildShareUrl(resourceType: ResourceType, token: string): string {
  const path =
    resourceType === 'dashboard'
      ? routes.share.dashboard(token)
      : routes.share.insight(token);
  return `${window.location.origin}${path}`;
}

function ShareTokenRow({
  token,
  resourceType,
  onRevoke,
}: {
  token: ShareToken;
  resourceType: ResourceType;
  onRevoke: (id: string) => void;
}) {
  const { t } = useLocalTranslation(translations);
  const [copied, setCopied] = useState(false);

  const url = buildShareUrl(resourceType, token.token);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [url]);

  return (
    <div className="flex flex-col gap-1.5 p-3 rounded-md border border-border bg-secondary/40">
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          className="flex-1 text-xs font-mono bg-transparent text-muted-foreground truncate outline-none"
        />
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleCopy}
          title={t('copyLink')}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => onRevoke(token.id)}
          title={t('revoke')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span>{t('createdAt', { date: formatDate(token.created_at) })}</span>
        {token.expires_at ? (
          <span>{t('expiresAt', { date: formatDate(token.expires_at) })}</span>
        ) : (
          <span>{t('neverExpires')}</span>
        )}
      </div>
    </div>
  );
}

export function ShareDialog({
  open,
  onOpenChange,
  resourceType,
  resourceId,
  projectId,
}: ShareDialogProps) {
  const { t } = useLocalTranslation(translations);
  const queryClient = useQueryClient();
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const queryKey = ['share-tokens', resourceType, resourceId, projectId];

  const { data: tokens, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => {
      if (resourceType === 'dashboard') {
        return api.dashboardsControllerListShareTokens({ projectId, dashboardId: resourceId });
      }
      return api.savedInsightsControllerListShareTokens({ projectId, insightId: resourceId });
    },
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (resourceType === 'dashboard') {
        return api.dashboardsControllerCreateShareToken(
          { projectId, dashboardId: resourceId },
          {},
        );
      }
      return api.savedInsightsControllerCreateShareToken(
        { projectId, insightId: resourceId },
        {},
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      toast.success(t('toastCreated'));
    },
    onError: () => {
      toast.error(t('toastCreateFailed'));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (tokenId: string) => {
      if (resourceType === 'dashboard') {
        return api.dashboardsControllerRevokeShareToken({ projectId, dashboardId: resourceId, tokenId });
      }
      return api.savedInsightsControllerRevokeShareToken({ projectId, insightId: resourceId, tokenId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      toast.success(t('toastRevoked'));
      setRevokeTarget(null);
    },
    onError: () => {
      toast.error(t('toastRevokeFailed'));
    },
  });

  const handleRevoke = useCallback(async () => {
    if (revokeTarget) {
      await revokeMutation.mutateAsync(revokeTarget);
    }
  }, [revokeTarget, revokeMutation]);

  const handleRevokeRequest = useCallback((tokenId: string) => {
    setRevokeTarget(tokenId);
  }, []);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-1">
            {isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            )}

            {!isLoading && isError && (
              <p className="text-sm text-muted-foreground text-center py-4">{t('error')}</p>
            )}

            {!isLoading && !isError && tokens?.length === 0 && (
              <EmptyState
                icon={Link2}
                description={t('noTokensDescription')}
                className="py-6"
              />
            )}

            {!isLoading && !isError && tokens && tokens.length > 0 && (
              <div className="space-y-2">
                {tokens.map((token) => (
                  <ShareTokenRow
                    key={token.id}
                    token={token}
                    resourceType={resourceType}
                    onRevoke={handleRevokeRequest}
                  />
                ))}
              </div>
            )}

            <Button
              variant="outline"
              className="w-full"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('createLink')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => { if (!open) {setRevokeTarget(null);} }}
        title={t('revokeConfirmTitle')}
        description={t('revokeConfirmDescription')}
        confirmLabel={t('revokeConfirmLabel')}
        variant="destructive"
        onConfirm={handleRevoke}
      />
    </>
  );
}
