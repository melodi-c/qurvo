import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useProjectId } from '@/hooks/use-project-id';
import { PageHeader } from '@/components/ui/page-header';
import { TabNav } from '@/components/ui/tab-nav';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './index.translations';
import { GeneralTab } from './general-tab';
import { MembersTab } from './members-tab';
import { ApiKeysTab } from './api-keys-tab';
import { BillingTab } from './billing-tab';

type TabId = 'general' | 'members' | 'keys' | 'billing';

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = useProjectId();
  const activeTab = (searchParams.get('tab') as TabId) || 'general';
  const { t } = useLocalTranslation(translations);

  const tabs = useMemo(() => [
    { id: 'general' as const, label: t('general') },
    { id: 'members' as const, label: t('members') },
    { id: 'keys' as const, label: t('apiKeys') },
    { id: 'billing' as const, label: t('billing') },
  ], [t]);

  const setTab = (tab: TabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next);
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      <TabNav tabs={tabs} value={activeTab} onChange={setTab} />

      {activeTab === 'general' && <GeneralTab projectId={projectId} />}
      {activeTab === 'members' && <MembersTab projectId={projectId} />}
      {activeTab === 'keys' && <ApiKeysTab projectId={projectId} />}
      {activeTab === 'billing' && <BillingTab projectId={projectId} />}
    </div>
  );
}
