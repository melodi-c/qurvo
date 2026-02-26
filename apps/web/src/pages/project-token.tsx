import { useProjectId } from '@/hooks/use-project-id';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Key } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './project-token.translations';
import { ProjectTokenTab } from './settings/project-token-tab';

export default function ProjectTokenPage() {
  const { t } = useLocalTranslation(translations);
  const projectId = useProjectId();

  if (!projectId) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} />
        <EmptyState icon={Key} description={t('selectProject')} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />
      <ProjectTokenTab projectId={projectId} />
    </div>
  );
}
