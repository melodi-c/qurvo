import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FolderOpen } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { apiClient } from '@/api/client';
import { routes } from '@/lib/routes';
import type { AdminProjectListItem } from '@/api/generated/Api';
import translations from './admin-projects-page.translations';
import { formatDate } from '@/lib/formatting';

export default function AdminProjectsPage() {
  const { t } = useLocalTranslation(translations);
  const navigate = useNavigate();

  const { data: projects, isLoading } = useQuery({
    queryKey: ['admin', 'projects'],
    queryFn: () => apiClient.admin.adminProjectsControllerListProjects(),
  });

  const columns: Column<AdminProjectListItem>[] = [
    {
      key: 'name',
      header: t('name'),
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: 'slug',
      header: t('slug'),
      render: (row) => <span className="text-muted-foreground font-mono text-xs">{row.slug}</span>,
      hideOnMobile: true,
    },
    {
      key: 'plan',
      header: t('plan'),
      render: (row) =>
        row.plan_name ? (
          <Badge variant="default">{row.plan_name}</Badge>
        ) : (
          <Badge variant="secondary">{t('noPlan')}</Badge>
        ),
    },
    {
      key: 'member_count',
      header: t('memberCount'),
      render: (row) => <span>{row.member_count}</span>,
      hideOnMobile: true,
    },
    {
      key: 'created_at',
      header: t('createdAt'),
      render: (row) => (
        <span className="text-muted-foreground">
          {formatDate(row.created_at)}
        </span>
      ),
      hideOnMobile: true,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      {isLoading && <ListSkeleton count={5} />}

      {!isLoading && projects && projects.length === 0 && (
        <EmptyState
          icon={FolderOpen}
          title={t('noProjects')}
          description={t('noProjectsDescription')}
        />
      )}

      {!isLoading && projects && projects.length > 0 && (
        <DataTable
          columns={columns}
          data={projects}
          rowKey={(row) => row.id}
          onRowClick={(row) => navigate(routes.admin.projects.detail(row.id))}
        />
      )}
    </div>
  );
}
