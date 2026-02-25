import { FolderOpen } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './admin-project-detail.translations';

export default function AdminProjectDetailPage() {
  const { t } = useLocalTranslation(translations);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />
      <EmptyState
        icon={FolderOpen}
        title={t('comingSoon')}
        description={t('description')}
      />
    </div>
  );
}
