import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft } from 'lucide-react';
import { api } from '@/api/client';

export default function PersonDetailPage() {
  const { personId } = useParams<{ personId: string }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const navigate = useNavigate();
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
        <CardContent>
          {eventsLoading && (
            <div className="space-y-2 py-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )}

          {!eventsLoading && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Event</th>
                    <th className="pb-2 pr-4">Identifier</th>
                    <th className="pb-2 pr-4">Time</th>
                    <th className="pb-2 pr-4">URL</th>
                  </tr>
                </thead>
                <tbody>
                  {(events ?? []).map((ev) => (
                    <tr
                      key={ev.event_id}
                      className="border-b border-border hover:bg-muted/50"
                    >
                      <td className="py-2 pr-4 font-medium">{ev.event_name}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                        {ev.distinct_id}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {new Date(ev.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground truncate max-w-xs">
                        {ev.url}
                      </td>
                    </tr>
                  ))}
                  {(events ?? []).length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-muted-foreground">
                        No events found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-between items-center mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page + 1}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={(events ?? []).length < limit}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
