import { AlertTriangle, List } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { EventTable } from '@/components/event-table';
import { RequireProject } from '@/components/require-project';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useEvents } from '@/hooks/use-events';
import translations from './index.translations';
import { EventsFilterPanel } from './EventsFilterPanel';
import { useEventsFilters } from './use-events-filters';

export default function EventsPage() {
  const { t } = useLocalTranslation(translations);

  const {
    filterState,
    page,
    setPage,
    handleEventNameChange,
    handleDateChange,
    handleFiltersChange,
  } = useEventsFilters();

  const { projectId, events, isLoading, isError, limit } = useEvents(filterState, page);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      <RequireProject icon={List} description={t('selectProject')}>
        <EventsFilterPanel
          eventName={filterState.eventName}
          onEventNameChange={handleEventNameChange}
          dateFrom={filterState.dateFrom}
          dateTo={filterState.dateTo}
          onDateChange={handleDateChange}
          filters={filterState.filters}
          onFiltersChange={handleFiltersChange}
        />

        {isLoading && <ListSkeleton count={8} height="h-9" className="space-y-2" />}

        {!isLoading && isError && (
          <EmptyState icon={AlertTriangle} description={t('errorLoading')} />
        )}

        {!isLoading && !isError && (
          <EventTable
            events={events ?? []}
            showPerson
            projectId={projectId}
            page={page}
            onPageChange={setPage}
            // API returns EventRow[] without total count; use length heuristic
            hasMore={(events ?? []).length >= limit}
          />
        )}
      </RequireProject>
    </div>
  );
}
