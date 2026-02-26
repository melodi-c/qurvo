import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { api } from '@/api/client';
import { toast } from 'sonner';
import { Copy, Check } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import translations from './project-token-tab.translations';

export function ProjectTokenTab({ projectId }: { projectId: string }) {
  const { t } = useLocalTranslation(translations);
  const { copied, copy } = useCopyToClipboard(2000, () => toast.error(t('copyFailed')));

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projectsControllerGetById({ id: projectId }),
    enabled: !!projectId,
  });

  if (isLoading) return <ListSkeleton count={1} height="h-20" />;

  const token = project?.token;

  const handleCopy = (value: string) => {
    copy(value);
    toast.success(t('copySuccess'));
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium mb-1">{t('tokenLabel')}</h3>
          <p className="text-sm text-muted-foreground mb-3">{t('tokenDescription')}</p>
        </div>

        {token && (
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted p-3 rounded text-sm break-all font-mono">{token}</code>
            <Button size="icon" variant="outline" onClick={() => handleCopy(token)}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <h3 className="text-sm font-semibold">{t('sdkGuideTitle')}</h3>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t('installStep')}</p>
          <p className="text-sm text-muted-foreground">{t('installDescription')}</p>
          <pre className="bg-muted p-3 rounded text-sm overflow-x-auto font-mono">
            <code>npm install @qurvo/sdk-browser</code>
          </pre>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t('initStep')}</p>
          <p className="text-sm text-muted-foreground">{t('initDescription')}</p>
          <pre className="bg-muted p-3 rounded text-sm overflow-x-auto font-mono">
            <code>{`import { Qurvo } from '@qurvo/sdk-browser';

const qurvo = new Qurvo({
  apiKey: '${token ?? 'YOUR_PROJECT_TOKEN'}',
});`}</code>
          </pre>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t('trackStep')}</p>
          <p className="text-sm text-muted-foreground">{t('trackDescription')}</p>
          <pre className="bg-muted p-3 rounded text-sm overflow-x-auto font-mono">
            <code>{`qurvo.track('button_clicked', {
  button_name: 'signup',
  page: '/home',
});`}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
