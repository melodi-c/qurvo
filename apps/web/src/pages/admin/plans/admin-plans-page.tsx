import { CreditCard } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './admin-plans-page.translations';

export default function AdminPlansPage() {
  const { t } = useLocalTranslation(translations);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />
      <EmptyState
        icon={CreditCard}
        title={t('comingSoon')}
        description={t('description')}
      />
    </div>
  );
}
