import { useMemo } from 'react';
import { useProjectId } from '@/hooks/use-project-id';
import { useUrlTab } from '@/hooks/use-url-tab';
import { PageHeader } from '@/components/ui/page-header';
import { TabNav } from '@/components/ui/tab-nav';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './index.translations';
import { GeneralTab } from './general-tab';
import { MembersTab } from './members-tab';
import { ApiKeysTab } from './api-keys-tab';
import { BillingTab } from './billing-tab';
import { IngestionWarningsTab } from './ingestion-warnings-tab';

type TabId = 'general' | 'members' | 'keys' | 'billing' | 'warnings';

export default function SettingsPage() {
  const projectId = useProjectId();
  const VALID_TABS = ['general', 'members', 'keys', 'billing', 'warnings'] as const;
  const [activeTab, setTab] = useUrlTab<TabId>('general', VALID_TABS);
  const { t } = useLocalTranslation(translations);

  const tabs = useMemo(() => [
    { id: 'general' as const, label: t('general') },
    { id: 'members' as const, label: t('members') },
    { id: 'keys' as const, label: t('apiKeys') },
    { id: 'billing' as const, label: t('billing') },
    { id: 'warnings' as const, label: t('warnings') },
  ], [t]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      <TabNav tabs={tabs} value={activeTab} onChange={setTab} />

      {activeTab === 'general' && <GeneralTab projectId={projectId} />}
      {activeTab === 'members' && <MembersTab projectId={projectId} />}
      {activeTab === 'keys' && <ApiKeysTab projectId={projectId} />}
      {activeTab === 'billing' && <BillingTab projectId={projectId} />}
      {activeTab === 'warnings' && <IngestionWarningsTab projectId={projectId} />}
    </div>
  );
}
