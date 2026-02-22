import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { TabNav } from '@/components/ui/tab-nav';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { MetricsTab } from '@/features/unit-economics/tabs/MetricsTab';
import { ChannelsTab } from '@/features/unit-economics/tabs/ChannelsTab';
import { SpendTab } from '@/features/unit-economics/tabs/SpendTab';
import { SettingsTab } from '@/features/unit-economics/tabs/SettingsTab';
import translations from './unit-economics.translations';

type TabId = 'metrics' | 'channels' | 'spend' | 'settings';

export default function UnitEconomicsPage() {
  const { t } = useLocalTranslation(translations);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as TabId) || 'metrics';

  const tabs = useMemo(() => [
    { id: 'metrics' as const, label: t('tabMetrics') },
    { id: 'channels' as const, label: t('tabChannels') },
    { id: 'spend' as const, label: t('tabSpend') },
    { id: 'settings' as const, label: t('tabSettings') },
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
      {activeTab === 'metrics' && <MetricsTab />}
      {activeTab === 'channels' && <ChannelsTab />}
      {activeTab === 'spend' && <SpendTab />}
      {activeTab === 'settings' && <SettingsTab />}
    </div>
  );
}
