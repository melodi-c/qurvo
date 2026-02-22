import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { TabNav } from '@/components/ui/tab-nav';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './index.translations';
import { GeneralTab } from './general-tab';
import { MembersTab } from './members-tab';
import { ApiKeysTab } from './api-keys-tab';

type TabId = 'general' | 'members' | 'keys';

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const activeTab = (searchParams.get('tab') as TabId) || 'general';
  const { t } = useLocalTranslation(translations);

  const tabs = [
    { id: 'general' as const, label: t('general') },
    { id: 'members' as const, label: t('members') },
    { id: 'keys' as const, label: t('apiKeys') },
  ];

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
    </div>
  );
}
