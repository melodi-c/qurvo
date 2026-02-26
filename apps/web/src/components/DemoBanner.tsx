import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Zap, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { api } from '@/api/client';
import { routes } from '@/lib/routes';
import translations from './DemoBanner.translations';

interface DemoBannerProps {
  projectId: string;
  projectSlug: string;
  isDemo: boolean;
}

export function DemoBanner({ projectId, projectSlug, isDemo }: DemoBannerProps) {
  const { t } = useLocalTranslation(translations);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const storageKey = `demo-banner-dismissed-${projectId}`;
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  });

  const resetMutation = useMutation({
    mutationFn: () => api.demoControllerReset({ projectSlug }, {}),
    onSuccess: () => {
      toast.success(t('resetSuccess'));
      void qc.invalidateQueries({ queryKey: ['events', projectId] });
      void qc.invalidateQueries({ queryKey: ['persons', projectId] });
      void qc.invalidateQueries({ queryKey: ['persons-search', projectId] });
      void qc.invalidateQueries({ queryKey: ['trend', projectId] });
      void qc.invalidateQueries({ queryKey: ['funnel', projectId] });
      void qc.invalidateQueries({ queryKey: ['retention', projectId] });
      void qc.invalidateQueries({ queryKey: ['lifecycle', projectId] });
      void qc.invalidateQueries({ queryKey: ['stickiness', projectId] });
      void qc.invalidateQueries({ queryKey: ['paths', projectId] });
      void qc.invalidateQueries({ queryKey: ['web-analytics', projectId] });
    },
    onError: () => {
      toast.error(t('resetFailed'));
    },
  });

  if (!isDemo || dismissed) {
    return null;
  }

  function handleDismiss() {
    try {
      localStorage.setItem(storageKey, 'true');
    } catch {
      // ignore
    }
    setDismissed(true);
  }

  function handleConnectSdk() {
    navigate(routes.keys(projectId));
  }

  return (
    <>
      <div className="flex flex-col gap-2 md:flex-row md:items-center px-4 py-2.5 bg-primary/10 border-b border-primary/20 text-sm">
        <span className="flex-1 text-foreground/80">{t('bannerText')}</span>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="default"
            onClick={handleConnectSdk}
          >
            <Zap className="h-3.5 w-3.5 md:mr-1.5" />
            <span className="hidden md:inline">{t('connectSdk')}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmOpen(true)}
            disabled={resetMutation.isPending}
          >
            <RotateCcw className="h-3.5 w-3.5 md:mr-1.5" />
            <span className="hidden md:inline">{t('resetData')}</span>
          </Button>
          <button
            onClick={handleDismiss}
            className="flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('resetConfirmTitle')}
        description={t('resetConfirmDescription')}
        variant="destructive"
        onConfirm={() => resetMutation.mutateAsync()}
      />
    </>
  );
}
