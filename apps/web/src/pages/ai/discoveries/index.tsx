import { Lightbulb } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useProjectId } from '@/hooks/use-project-id';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { AiTabNav } from '../ai-tab-nav';
import { AiInsightsSection } from '../ai-insights-section';
import translations from './index.translations';

export default function AiDiscoveriesPage() {
  const { t } = useLocalTranslation(translations);
  const projectId = useProjectId();

  if (!projectId) {
    return <EmptyState icon={Lightbulb} description={t('selectProject')} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('title')} />
      <AiTabNav />
      <AiInsightsSection projectId={projectId} />
    </div>
  );
}
