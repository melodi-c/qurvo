import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { api } from '@/api/client';
import { toast } from 'sonner';
import { Copy, Check } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import translations from './api-keys-tab.translations';

export function ApiKeysTab({ projectId }: { projectId: string }) {
  const { copied, copy } = useCopyToClipboard(2000, () => toast.error(t('copyFailed')));
  const { t } = useLocalTranslation(translations);

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projectsControllerGetById({ id: projectId }),
    enabled: !!projectId,
  });

  if (isLoading) return <ListSkeleton count={1} height="h-20" />;

  const token = project?.token;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-sm font-medium mb-1">{t('tokenLabel')}</h3>
        <p className="text-sm text-muted-foreground mb-4">{t('tokenDescription')}</p>
      </div>

      {token && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted p-3 rounded text-sm break-all">{token}</code>
              <Button size="icon" variant="outline" onClick={() => copy(token)}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
