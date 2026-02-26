import { AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { EventTable } from '@/components/event-table';
import { PropsTable } from '@/components/event-props-table';
import { getPersonDisplayName } from '@/lib/person';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { usePersonDetail } from '@/hooks/use-person-detail';
import translations from './person-detail.translations';
import { formatDate } from '@/lib/formatting';

export default function PersonDetailPage() {
  const { t } = useLocalTranslation(translations);
  const {
    personId,
    projectId,
    person,
    personLoading,
    personError,
    events,
    eventsLoading,
    eventsError,
    page,
    setPage,
    limit,
  } = usePersonDetail();

  const props = (person?.properties ?? {}) as Record<string, unknown>;
  const displayName = getPersonDisplayName(person, personId);

  return (
    <div className="space-y-6">
      <PageHeader title={personLoading ? <Skeleton className="h-7 w-48" /> : (displayName ?? '')} />

      {!personLoading && personError && (
        <EmptyState icon={AlertTriangle} description={t('errorLoadingPerson')} />
      )}

      {!personError && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">{t('profile')}</CardTitle>
            </CardHeader>
            <CardContent>
              {personLoading ? (
                <ListSkeleton count={4} height="h-5" className="space-y-2" />
              ) : (
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs mb-1">{t('personId')}</dt>
                    <dd className="font-mono text-xs break-all">{person?.id}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs mb-1">{t('identifiers')}</dt>
                    <dd className="flex flex-wrap gap-1">
                      {(person?.distinct_ids ?? []).map((id) => (
                        <Badge key={id} variant="secondary" className="font-mono text-xs">
                          {id}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t('firstSeen')}</dt>
                    <dd>
                      {person ? formatDate(person.created_at) : '\u2014'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t('lastSeen')}</dt>
                    <dd>
                      {person ? formatDate(person.updated_at) : '\u2014'}
                    </dd>
                  </div>
                </dl>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium">{t('properties')}</CardTitle>
            </CardHeader>
            <CardContent>
              {personLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : Object.keys(props).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('noProperties')}</p>
              ) : (
                <PropsTable rows={Object.entries(props).map(([k, v]) => ({ key: k, value: String(v) }))} />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-medium">{t('eventHistory')}</h2>
        {eventsLoading && <ListSkeleton count={6} height="h-10" className="space-y-2" />}

        {!eventsLoading && eventsError && (
          <EmptyState icon={AlertTriangle} description={t('errorLoadingEvents')} />
        )}

        {!eventsLoading && !eventsError && (
          <EventTable
            events={events ?? []}
            projectId={projectId}
            page={page}
            onPageChange={setPage}
            hasMore={(events ?? []).length >= limit}
          />
        )}
      </div>
    </div>
  );
}
