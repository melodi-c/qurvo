import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Database, ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { Button } from '@/components/ui/button';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useEventDefinitions } from '@/hooks/use-event-definitions';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './translations';
import { EventInfoCard } from './EventInfoCard';
import { EventPropertiesSection } from './EventPropertiesSection';

export default function EventDefinitionDetailPage() {
  const { t } = useLocalTranslation(translations);
  const { eventName: rawEventName } = useParams<{ eventName: string }>();
  const eventName = rawEventName ? decodeURIComponent(rawEventName) : '';
  const { go, link, projectId } = useAppNavigate();

  const { data: definitions, isLoading: eventsLoading } = useEventDefinitions();
  const eventDef = useMemo(
    () => definitions?.find((d) => d.event_name === eventName),
    [definitions, eventName],
  );

  const backPath = link.dataManagement.list();

  const breadcrumbs = useMemo(() => [
    { label: t('dataManagement'), path: backPath },
    { label: eventName },
  ], [backPath, eventName, t]);

  if (!projectId) {
    return (
      <div className="space-y-6">
        <PageHeader title={<Breadcrumbs items={breadcrumbs} />} />
        <EmptyState icon={Database} description={t('selectProject')} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={<Breadcrumbs items={breadcrumbs} />}>
        <Button variant="ghost" size="sm" onClick={() => go.dataManagement.list()}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          {t('back')}
        </Button>
      </PageHeader>

      {eventsLoading && <ListSkeleton count={3} />}

      {!eventsLoading && !eventDef && (
        <EmptyState
          icon={Database}
          title={t('eventNotFound')}
          description={t('eventNotFoundDescription', { name: eventName })}
        />
      )}

      {!eventsLoading && eventDef && (
        <>
          <EventInfoCard eventName={eventName} eventDef={eventDef} />
          <EventPropertiesSection eventName={eventName} />
        </>
      )}
    </div>
  );
}
