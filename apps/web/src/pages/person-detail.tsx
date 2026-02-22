import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { EventTable } from '@/components/event-table';
import { api } from '@/api/client';

export default function PersonDetailPage() {
  const { personId } = useParams<{ personId: string }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data: person, isLoading: personLoading } = useQuery({
    queryKey: ['person', projectId, personId],
    queryFn: () =>
      api.personsControllerGetPersonById({ personId: personId!, project_id: projectId }),
    enabled: !!projectId && !!personId,
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['person-events', projectId, personId, page],
    queryFn: () =>
      api.personsControllerGetPersonEvents({
        personId: personId!,
        project_id: projectId,
        limit,
        offset: page * limit,
      }),
    enabled: !!projectId && !!personId,
  });

  const props = (person?.properties ?? {}) as Record<string, unknown>;
  const displayName =
    String(props['name'] ?? props['$name'] ?? '') ||
    String(props['email'] ?? props['$email'] ?? '') ||
    person?.distinct_ids[0] ||
    person?.id?.slice(0, 8) ||
    personId;

  return (
    <div className="space-y-6">
      <PageHeader title={personLoading ? '...' : (displayName ?? '')} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            {personLoading ? (
              <ListSkeleton count={4} height="h-5" className="space-y-2" />
            ) : (
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs mb-1">Person ID</dt>
                  <dd className="font-mono text-xs break-all">{person?.id}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs mb-1">Identifiers</dt>
                  <dd className="flex flex-wrap gap-1">
                    {(person?.distinct_ids ?? []).map((id) => (
                      <Badge key={id} variant="secondary" className="font-mono text-xs">
                        {id}
                      </Badge>
                    ))}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">First seen</dt>
                  <dd>
                    {person ? new Date(person.created_at).toLocaleDateString() : '\u2014'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Last seen</dt>
                  <dd>
                    {person ? new Date(person.updated_at).toLocaleDateString() : '\u2014'}
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Properties</CardTitle>
          </CardHeader>
          <CardContent>
            {personLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : Object.keys(props).length === 0 ? (
              <p className="text-sm text-muted-foreground">No user properties recorded.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {Object.entries(props).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted-foreground text-xs truncate">{k}</dt>
                    <dd className="font-medium truncate">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">Event History</h2>
        {eventsLoading && <ListSkeleton count={6} height="h-10" className="space-y-2" />}

        {!eventsLoading && (
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
