import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Lightbulb, LinkIcon, FileQuestion } from 'lucide-react';
import { apiClient } from '@/api/client';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './public-insight.translations';
import type { InsightType } from '@/api/generated/Api';

export default function PublicInsightPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const { t } = useLocalTranslation(translations);

  const { data: insight, isLoading, isError, error } = useQuery({
    queryKey: ['public-insight', shareToken],
    queryFn: () => apiClient.public.publicControllerGetPublicInsight({ shareToken: shareToken! }),
    enabled: Boolean(shareToken),
    retry: false,
  });

  const is404 = isError && (error as { status?: number })?.status === 404;

  const typeLabels = useMemo((): Record<InsightType, string> => ({
    trend: t('typeTrend'),
    funnel: t('typeFunnel'),
    retention: t('typeRetention'),
    lifecycle: t('typeLifecycle'),
    stickiness: t('typeStickiness'),
    paths: t('typePaths'),
  }), [t]);

  const typeLabel = insight ? (typeLabels[insight.type] ?? insight.type) : '';

  return (
    <div className="min-h-screen bg-background">
      {/* Public header bar */}
      <header className="sticky top-0 z-10 bg-sidebar border-b border-border px-4 lg:px-6 h-12 flex items-center gap-3">
        <Lightbulb className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="font-semibold text-sm truncate flex-1">
          {isLoading
            ? <Skeleton className="h-4 w-40 inline-block" />
            : (insight?.name ?? '')}
        </span>
        {insight && (
          <Badge variant="secondary" className="text-xs shrink-0">
            {typeLabel}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground shrink-0 ml-2">{t('poweredBy')}</span>
      </header>

      <main className="p-4 lg:p-6 max-w-4xl mx-auto">
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {!isLoading && isError && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <EmptyState
              icon={is404 ? FileQuestion : LinkIcon}
              title={is404 ? t('notFound') : t('expired')}
              description={is404 ? t('notFoundDescription') : t('expiredDescription')}
            />
          </div>
        )}

        {!isLoading && insight && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">{insight.name}</h1>
              {insight.description && (
                <p className="text-muted-foreground">{insight.description}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  {t('type')}: <span className="text-foreground">{typeLabel}</span>
                </span>
                <span>{t('updated')}: {new Date(insight.updated_at).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-secondary/30 p-8 flex items-center justify-center min-h-[200px]">
              <EmptyState
                icon={Lightbulb}
                description={t('viewFull')}
                className="py-0"
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
