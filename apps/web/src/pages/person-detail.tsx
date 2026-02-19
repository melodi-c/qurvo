import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft } from 'lucide-react';
import { api } from '@/api/client';
import { EventTableRow } from '@/components/event-detail';
import type { EventLike } from '@/components/event-detail';
import type { PersonEventRow } from '@/api/generated/Api';

function toEventLike(e: PersonEventRow): EventLike {
  return {
    ...e,
    screen_width: e.screen_width ?? 0,
    screen_height: e.screen_height ?? 0,
  };
}

export default function PersonDetailPage() {
  const { personId } = useParams<{ personId: string }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
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
    person?.distinct_ids[0] ||
    person?.id?.slice(0, 8) ||
    personId;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/persons?project=${projectId}`)}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">
          {personLoading ? <Skeleton className="h-7 w-48 inline-block" /> : displayName}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Profile card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            {personLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
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
                    {person ? new Date(person.created_at).toLocaleDateString() : '—'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Last seen</dt>
                  <dd>
                    {person ? new Date(person.updated_at).toLocaleDateString() : '—'}
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Properties card */}
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

      {/* Event history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Event History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {eventsLoading && (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )}

          {!eventsLoading && (
            <div>
              {/* Header */}
              <div className="grid grid-cols-[20px_1fr_80px_140px] gap-3 px-4 py-2 border-b border-border text-xs font-medium text-muted-foreground">
                <span />
                <span>Event</span>
                <span>When</span>
                <span>Browser</span>
              </div>

              {(events ?? []).map((ev) => (
                <EventTableRow
                  key={ev.event_id}
                  event={toEventLike(ev)}
                  expanded={expandedRow === ev.event_id}
                  onToggle={() => setExpandedRow(expandedRow === ev.event_id ? null : ev.event_id)}
                  showPerson={false}
                />
              ))}

              {(events ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No events found</p>
              )}

              <div className="flex justify-between items-center px-4 py-3 border-t border-border">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">Page {page + 1}</span>
                <Button variant="outline" size="sm" disabled={(events ?? []).length < limit} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
