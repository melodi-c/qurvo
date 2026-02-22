import { useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Database, Check } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useEventDefinitions } from '@/features/event-definitions/hooks/use-event-definitions';
import type { EventDefinition } from '@/api/generated/Api';

export default function EventDefinitionsPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data: definitions, isLoading } = useEventDefinitions();

  const filtered = useMemo(
    () => definitions?.filter((d) => d.event_name.toLowerCase().includes(search.toLowerCase())),
    [definitions, search],
  );

  const columns: Column<EventDefinition>[] = useMemo(() => [
    {
      key: 'event_name',
      header: 'Event Name',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-foreground">{row.event_name}</span>
          {row.verified && (
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-primary/15">
              <Check className="w-3 h-3 text-primary" />
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'count',
      header: 'Volume (30d)',
      headerClassName: 'w-32',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {row.count.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.description || <span className="italic opacity-40">No description</span>}
        </span>
      ),
    },
    {
      key: 'tags',
      header: 'Tags',
      hideOnMobile: true,
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {(row.tags ?? []).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      ),
    },
  ], []);

  function handleRowClick(row: EventDefinition) {
    const params = projectId ? `?project=${projectId}` : '';
    navigate(`/data-management/${encodeURIComponent(row.event_name)}${params}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Data Management" />

      {!projectId && (
        <EmptyState icon={Database} description="Select a project to view definitions" />
      )}

      {projectId && isLoading && <ListSkeleton count={8} />}

      {projectId && !isLoading && (
        <>
          <div className="flex items-center gap-3">
            <Input
              placeholder="Search events..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            {filtered && (
              <span className="text-sm text-muted-foreground">
                {filtered.length} event{filtered.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {filtered && filtered.length === 0 && (
            <EmptyState
              icon={Database}
              title="No events found"
              description={search ? 'No events match your search' : 'No events have been tracked yet'}
            />
          )}

          {filtered && filtered.length > 0 && (
            <DataTable
              columns={columns}
              data={filtered}
              rowKey={(row) => row.event_name}
              onRowClick={handleRowClick}
            />
          )}
        </>
      )}
    </div>
  );
}
