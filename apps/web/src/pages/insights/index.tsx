import { useMemo, useCallback } from 'react';
import { Lightbulb } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { useInsights, useDeleteInsight, useToggleFavorite } from '@/features/insights/hooks/use-insights';
import { useInsightsFilters } from '@/features/insights/hooks/use-insights-filters';
import { InsightsFilterBar } from '@/features/insights/components/InsightsFilterBar';
import { InsightsTable } from '@/features/insights/components/InsightsTable';
import { NewInsightDropdown } from '@/features/insights/components/NewInsightDropdown';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './index.translations';
import type { Insight } from '@/api/generated/Api';

export default function InsightsPage() {
  const { t } = useLocalTranslation(translations);
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') ?? '';

  const { data: insights, isLoading } = useInsights();
  const deleteMutation = useDeleteInsight();
  const toggleFavoriteMutation = useToggleFavorite();
  const { filters, setFilter } = useInsightsFilters();

  const handleDelete = useCallback(
    (id: string) => deleteMutation.mutateAsync(id),
    [deleteMutation],
  );

  const handleToggleFavorite = useCallback(
    (id: string, current: boolean) =>
      toggleFavoriteMutation.mutate({ insightId: id, is_favorite: !current }),
    [toggleFavoriteMutation],
  );

  const filtered = useMemo((): Insight[] => {
    if (!insights) return [];

    let result = insights;

    if (filters.type !== 'all') {
      result = result.filter((i) => i.type === filters.type);
    }

    if (filters.favorites) {
      result = result.filter((i) => i.is_favorite);
    }

    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      result = result.filter((i) => i.name.toLowerCase().includes(q));
    }

    result = [...result].sort((a, b) => {
      const diff = new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      return filters.sort === 'oldest' ? -diff : diff;
    });

    return result;
  }, [insights, filters]);

  const isEmpty = !isLoading && insights && insights.length === 0;
  const noResults = !isLoading && insights && insights.length > 0 && filtered.length === 0;

  return (
    <div className="space-y-4">
      <PageHeader title={t('title')}>
        <NewInsightDropdown />
      </PageHeader>

      {!projectId && (
        <EmptyState
          icon={Lightbulb}
          description={t('selectProject')}
        />
      )}

      {projectId && isLoading && <ListSkeleton count={5} />}

      {projectId && !isLoading && (
        <>
          {!isEmpty && (
            <InsightsFilterBar filters={filters} setFilter={setFilter} />
          )}

          {isEmpty && (
            <EmptyState
              icon={Lightbulb}
              title={t('noYet')}
              description={t('createFirst')}
              action={<NewInsightDropdown />}
            />
          )}

          {noResults && (
            <EmptyState
              icon={Lightbulb}
              description={t('noMatch')}
            />
          )}

          {filtered.length > 0 && (
            <InsightsTable
              data={filtered}
              onToggleFavorite={handleToggleFavorite}
              onDelete={handleDelete}
            />
          )}
        </>
      )}
    </div>
  );
}
