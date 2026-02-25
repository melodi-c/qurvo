import { useProjectId } from '@/hooks/use-project-id';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Plus, Key } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './api-keys.translations';
import { ApiKeysTab } from './settings/api-keys-tab';

export default function ApiKeysPage() {
  const { t } = useLocalTranslation(translations);
  const projectId = useProjectId();

  if (!projectId) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')}>
          <Button disabled>
            <Plus className="h-4 w-4 mr-2" /> {t('newKey')}
          </Button>
        </PageHeader>
        <EmptyState icon={Key} description={t('selectProject')} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />
      <ApiKeysTab projectId={projectId} />
    </div>
  );
}
