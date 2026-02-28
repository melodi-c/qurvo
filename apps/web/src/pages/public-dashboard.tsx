import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { LayoutDashboard, LinkIcon, FileQuestion } from 'lucide-react';
import { apiClient } from '@/api/client';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { getInsightTypeLabel } from '@/lib/i18n-utils';
import translations from './public-dashboard.translations';
import type { Widget } from '@/api/generated/Api';

function PublicWidgetCard({ widget }: { widget: Widget }) {
  const { t } = useLocalTranslation(translations);

  // Text tile widget
  if (!widget.insight && widget.content) {
    return (
      <div className="rounded-lg border border-border bg-secondary/30 p-4 min-h-[120px]">
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{widget.content}</p>
      </div>
    );
  }

  // Insight widget — show name + type in read-only card
  if (widget.insight) {
    return (
      <div className="rounded-lg border border-border bg-secondary/30 p-4 min-h-[120px] flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm truncate">{widget.insight.name}</span>
          <span className="ml-auto text-xs text-muted-foreground shrink-0">
            {getInsightTypeLabel(widget.insight.type)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('insightWidget')}
        </p>
      </div>
    );
  }

  return null;
}

export default function PublicDashboardPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const { t } = useLocalTranslation(translations);

  const { data: dashboard, isLoading, isError, error } = useQuery({
    queryKey: ['public-dashboard', shareToken],
    queryFn: () => apiClient.public.publicControllerGetPublicDashboard({ shareToken: shareToken! }),
    enabled: Boolean(shareToken),
    retry: false,
  });

  const isExpiredOrNotFound = isError;

  // Detect 404 vs other errors
  const is404 = isError && error instanceof AxiosError && error.response?.status === 404;

  return (
    <div className="min-h-screen bg-background">
      {/* Public header bar */}
      <header className="sticky top-0 z-10 bg-sidebar border-b border-border px-4 lg:px-6 h-12 flex items-center gap-3">
        <LayoutDashboard className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="font-semibold text-sm truncate flex-1">
          {isLoading ? <Skeleton className="h-4 w-40" /> : (dashboard?.name ?? '')}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">{t('poweredBy')}</span>
      </header>

      <main className="p-4 lg:p-6 max-w-7xl mx-auto">
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        )}

        {!isLoading && isExpiredOrNotFound && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <EmptyState
              icon={is404 ? FileQuestion : LinkIcon}
              title={is404 ? t('notFound') : t('expired')}
              description={is404 ? t('notFoundDescription') : t('expiredDescription')}
            />
          </div>
        )}

        {!isLoading && dashboard && (
          <>
            {dashboard.widgets.length === 0 && (
              <div className="flex items-center justify-center min-h-[60vh]">
                <EmptyState
                  icon={LayoutDashboard}
                  description={t('noWidgets')}
                />
              </div>
            )}

            {dashboard.widgets.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {dashboard.widgets.map((widget) => (
                  <PublicWidgetCard key={widget.id} widget={widget} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
