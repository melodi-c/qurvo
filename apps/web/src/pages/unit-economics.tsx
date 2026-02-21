import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { TabNav } from '@/components/ui/tab-nav';
import { MetricsTab } from '@/features/unit-economics/tabs/MetricsTab';
import { ChannelsTab } from '@/features/unit-economics/tabs/ChannelsTab';
import { SpendTab } from '@/features/unit-economics/tabs/SpendTab';
import { SettingsTab } from '@/features/unit-economics/tabs/SettingsTab';

const tabs = [
  { id: 'metrics', label: 'Metrics' },
  { id: 'channels', label: 'Channels' },
  { id: 'spend', label: 'Spend' },
  { id: 'settings', label: 'Settings' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export default function UnitEconomicsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as TabId) || 'metrics';

  const setTab = (tab: TabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Unit Economics" />
      <TabNav tabs={tabs} value={activeTab} onChange={setTab} />
      {activeTab === 'metrics' && <MetricsTab />}
      {activeTab === 'channels' && <ChannelsTab />}
      {activeTab === 'spend' && <SpendTab />}
      {activeTab === 'settings' && <SettingsTab />}
    </div>
  );
}
