import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/api/client';
import { ChevronDown, ChevronRight } from 'lucide-react';

export default function EventsPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const [filters, setFilters] = useState({ event_name: '', distinct_id: '' });
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data: events, isLoading } = useQuery({
    queryKey: ['events', projectId, filters, page],
    queryFn: () =>
      api.analyticsControllerGetEvents({
        project_id: projectId,
        ...(filters.event_name ? { event_name: filters.event_name } : {}),
        ...(filters.distinct_id ? { distinct_id: filters.distinct_id } : {}),
        limit: limit,
        offset: page * limit,
      }),
    enabled: !!projectId,
  });

  if (!projectId) {
    return <div className="text-muted-foreground">Select a project first</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Event Explorer</h1>

      <div className="flex gap-3">
        <Input
          placeholder="Filter by event name"
          value={filters.event_name}
          onChange={(e) => { setFilters((f) => ({ ...f, event_name: e.target.value })); setPage(0); }}
          className="max-w-xs"
        />
        <Input
          placeholder="Filter by distinct_id"
          value={filters.distinct_id}
          onChange={(e) => { setFilters((f) => ({ ...f, distinct_id: e.target.value })); setPage(0); }}
          className="max-w-xs"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Events</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-muted-foreground">Loading...</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-4 w-8"></th>
                  <th className="pb-2 pr-4">Event</th>
                  <th className="pb-2 pr-4">User</th>
                  <th className="pb-2 pr-4">Time</th>
                  <th className="pb-2 pr-4">URL</th>
                </tr>
              </thead>
              <tbody>
                {(events || []).map((event) => (
                  <>
                    <tr
                      key={event.event_id}
                      className="border-b border-border hover:bg-muted/50 cursor-pointer"
                      onClick={() => setExpandedRow(expandedRow === event.event_id ? null : event.event_id)}
                    >
                      <td className="py-2 pr-4">
                        {expandedRow === event.event_id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </td>
                      <td className="py-2 pr-4 font-medium">{event.event_name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{event.distinct_id}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{new Date(event.timestamp).toLocaleString()}</td>
                      <td className="py-2 pr-4 text-muted-foreground truncate max-w-xs">{event.url}</td>
                    </tr>
                    {expandedRow === event.event_id && (
                      <tr key={`${event.event_id}-detail`}>
                        <td colSpan={5} className="p-4 bg-muted/30">
                          <pre className="text-xs overflow-auto max-h-48 whitespace-pre-wrap">
                            {JSON.stringify(JSON.parse(event.properties || '{}'), null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center mt-4">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page + 1}</span>
            <Button variant="outline" size="sm" disabled={(events || []).length < limit} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
