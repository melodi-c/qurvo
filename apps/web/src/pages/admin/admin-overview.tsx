import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GridSkeleton } from '@/components/ui/grid-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/api/client';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './admin-overview.translations';

export default function AdminOverviewPage() {
  const { t } = useLocalTranslation(translations);

  const { data: stats, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => apiClient.admin.adminStatsControllerGetStats(),
  });

  const metrics = stats
    ? [
        { label: t('totalUsers'), value: stats.total_users.toLocaleString() },
        { label: t('totalProjects'), value: stats.total_projects.toLocaleString() },
        { label: t('totalEvents'), value: stats.total_events.toLocaleString() },
        { label: t('redisQueueDepth'), value: stats.redis_stream_depth.toLocaleString() },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      {isLoading && <GridSkeleton count={4} />}

      {!isLoading && isError && (
        <EmptyState
          icon={AlertTriangle}
          description={t('errorLoading')}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              {t('retry')}
            </Button>
          }
        />
      )}

      {!isLoading && !isError && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric) => (
            <Card key={metric.label}>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {metric.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{metric.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
