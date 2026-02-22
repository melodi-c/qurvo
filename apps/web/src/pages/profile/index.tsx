import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { TabNav } from '@/components/ui/tab-nav';
import { api } from '@/api/client';
import { ProfileTab } from './profile-tab';
import { InvitesTab } from './invites-tab';

const tabs = [
  { id: 'profile', label: 'Profile' },
  { id: 'invites', label: 'Invites' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export default function ProfilePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as TabId) || 'profile';

  const { data: myInvites } = useQuery({
    queryKey: ['myInvites'],
    queryFn: () => api.myInvitesControllerGetMyInvites(),
  });

  const pendingCount = myInvites?.length ?? 0;

  const setTab = (tab: TabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next);
  };

  const tabsWithBadge = tabs.map((t) =>
    t.id === 'invites' && pendingCount > 0
      ? { ...t, label: `Invites (${pendingCount})` }
      : t,
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" />

      <TabNav tabs={tabsWithBadge} value={activeTab} onChange={setTab} />

      {activeTab === 'profile' && <ProfileTab />}
      {activeTab === 'invites' && <InvitesTab />}
    </div>
  );
}
