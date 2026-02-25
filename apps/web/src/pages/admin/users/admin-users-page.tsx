import { Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './admin-users-page.translations';

export default function AdminUsersPage() {
  const { t } = useLocalTranslation(translations);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />
      <EmptyState
        icon={Users}
        title={t('comingSoon')}
        description={t('description')}
      />
    </div>
  );
}
