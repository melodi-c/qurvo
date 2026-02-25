import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUrlTab } from '@/hooks/use-url-tab';
import { PageHeader } from '@/components/ui/page-header';
import { TabNav } from '@/components/ui/tab-nav';
import { api } from '@/api/client';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './index.translations';
import { ProfileTab } from './profile-tab';
import { InvitesTab } from './invites-tab';

type TabId = 'profile' | 'invites';

export default function ProfilePage() {
  const [activeTab, setTab] = useUrlTab<TabId>('profile', ['profile', 'invites']);
  const { t } = useLocalTranslation(translations);

  const { data: myInvites } = useQuery({
    queryKey: ['myInvites'],
    queryFn: () => api.myInvitesControllerGetMyInvites(),
  });

  const pendingCount = myInvites?.length ?? 0;

  const tabs = useMemo(() => [
    { id: 'profile' as const, label: t('profileTab') },
    {
      id: 'invites' as const,
      label: pendingCount > 0 ? `${t('invitesTab')} (${pendingCount})` : t('invitesTab'),
    },
  ], [t, pendingCount]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      <TabNav tabs={tabs} value={activeTab} onChange={setTab} />

      {activeTab === 'profile' && <ProfileTab />}
      {activeTab === 'invites' && <InvitesTab />}
    </div>
  );
}
