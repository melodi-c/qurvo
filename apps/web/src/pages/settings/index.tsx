import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { TabNav } from '@/components/ui/tab-nav';
import { GeneralTab } from './general-tab';
import { MembersTab } from './members-tab';
import { ApiKeysTab } from './api-keys-tab';

const tabs = [
  { id: 'general', label: 'General' },
  { id: 'members', label: 'Members' },
  { id: 'keys', label: 'API Keys' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const activeTab = (searchParams.get('tab') as TabId) || 'general';

  const setTab = (tab: TabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />

      <TabNav tabs={tabs} value={activeTab} onChange={setTab} />

      {activeTab === 'general' && <GeneralTab projectId={projectId} />}
      {activeTab === 'members' && <MembersTab projectId={projectId} />}
      {activeTab === 'keys' && <ApiKeysTab projectId={projectId} />}
    </div>
  );
}
