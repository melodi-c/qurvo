import { useState, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Database, Check, ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useEventDefinitions, useUpsertEventDefinition } from '@/features/event-definitions/hooks/use-event-definitions';
import { usePropertyDefinitions, useUpsertPropertyDefinition } from '@/features/property-definitions/hooks/use-property-definitions';
import type { PropertyDefinition } from '@/api/generated/Api';

export default function EventDefinitionDetailPage() {
  const { eventName: rawEventName } = useParams<{ eventName: string }>();
  const eventName = rawEventName ? decodeURIComponent(rawEventName) : '';
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const navigate = useNavigate();

  const { data: definitions, isLoading: eventsLoading } = useEventDefinitions();
  const eventDef = useMemo(
    () => definitions?.find((d) => d.event_name === eventName),
    [definitions, eventName],
  );

  const backPath = `/data-management${projectId ? `?project=${projectId}` : ''}`;

  const breadcrumbs = useMemo(() => [
    { label: 'Data Management', path: backPath },
    { label: eventName },
  ], [backPath, eventName]);

  if (!projectId) {
    return (
      <div className="space-y-6">
        <PageHeader title={<Breadcrumbs items={breadcrumbs} />} />
        <EmptyState icon={Database} description="Select a project to view definitions" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={<Breadcrumbs items={breadcrumbs} />}>
        <Button variant="ghost" size="sm" onClick={() => navigate(backPath)}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </Button>
      </PageHeader>

      {eventsLoading && <ListSkeleton count={3} />}

      {!eventsLoading && !eventDef && (
        <EmptyState
          icon={Database}
          title="Event not found"
          description={`No event named "${eventName}" was found in the last 30 days`}
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

// ── Event Info Card ─────────────────────────────────────────────────────────

interface EventInfoCardProps {
  eventName: string;
  eventDef: {
    count: number;
    description?: string | null;
    tags?: string[] | null;
    verified?: boolean | null;
  };
}

function EventInfoCard({ eventName, eventDef }: EventInfoCardProps) {
  const [description, setDescription] = useState(eventDef.description ?? '');
  const [tags, setTags] = useState((eventDef.tags ?? []).join(', '));
  const [verified, setVerified] = useState(eventDef.verified ?? false);
  const upsertMutation = useUpsertEventDefinition();

  const hasChanges = useMemo(() => {
    const origDesc = eventDef.description ?? '';
    const origTags = (eventDef.tags ?? []).join(', ');
    const origVerified = eventDef.verified ?? false;
    return description !== origDesc || tags !== origTags || verified !== origVerified;
  }, [description, tags, verified, eventDef]);

  const handleSave = useCallback(async () => {
    const parsedTags = tags.split(',').map((t) => t.trim()).filter(Boolean);
    try {
      await upsertMutation.mutateAsync({
        eventName,
        data: {
          description: description || undefined,
          tags: parsedTags,
          verified,
        },
      });
      toast.success('Event definition updated');
    } catch {
      toast.error('Failed to update event definition');
    }
  }, [eventName, description, tags, verified, upsertMutation]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Event Info</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="event-description">Description</Label>
            <Input
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this event..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-tags">Tags</Label>
            <Input
              id="event-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="tag1, tag2, tag3"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setVerified((v) => !v)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className={`flex items-center justify-center w-5 h-5 rounded border transition-colors ${verified ? 'bg-primary border-primary' : 'border-border'}`}>
                {verified && <Check className="w-3 h-3 text-primary-foreground" />}
              </span>
              Verified
            </button>
            <span className="text-sm text-muted-foreground">
              Volume (30d): <span className="tabular-nums font-medium text-foreground">{eventDef.count.toLocaleString()}</span>
            </span>
          </div>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || upsertMutation.isPending}
          >
            {upsertMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Event Properties Section ────────────────────────────────────────────────

function EventPropertiesSection({ eventName }: { eventName: string }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'event' | 'person'>('all');
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ description: '', tags: '' });

  const type = typeFilter === 'all' ? undefined : typeFilter;
  const { data: definitions, isLoading } = usePropertyDefinitions(type, eventName);
  const upsertMutation = useUpsertPropertyDefinition();

  const filtered = useMemo(() => {
    if (!definitions) return undefined;
    return definitions.filter((d) =>
      !search || d.property_name.toLowerCase().includes(search.toLowerCase()),
    );
  }, [definitions, search]);

  const rowKey = useCallback(
    (row: PropertyDefinition) => `${row.property_name}:${row.property_type}`,
    [],
  );

  const startEdit = useCallback((row: PropertyDefinition) => {
    setEditingRow(rowKey(row));
    setEditValues({
      description: row.description ?? '',
      tags: (row.tags ?? []).join(', '),
    });
  }, [rowKey]);

  const cancelEdit = useCallback(() => {
    setEditingRow(null);
  }, []);

  const saveEdit = useCallback(async (row: PropertyDefinition) => {
    const parsedTags = editValues.tags.split(',').map((t) => t.trim()).filter(Boolean);
    try {
      await upsertMutation.mutateAsync({
        propertyName: row.property_name,
        propertyType: row.property_type,
        data: {
          description: editValues.description || undefined,
          tags: parsedTags,
        },
      });
      toast.success('Property definition updated');
      setEditingRow(null);
    } catch {
      toast.error('Failed to update property definition');
    }
  }, [editValues, upsertMutation]);

  const columns: Column<PropertyDefinition>[] = useMemo(() => [
    {
      key: 'property_name',
      header: 'Property',
      render: (row) => (
        <span className="font-mono text-sm text-foreground">{row.property_name}</span>
      ),
    },
    {
      key: 'property_type',
      header: 'Type',
      headerClassName: 'w-24',
      hideOnMobile: true,
      render: (row) => (
        <Badge variant="outline" className="text-xs capitalize">
          {row.property_type}
        </Badge>
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
      render: (row) => {
        if (editingRow === rowKey(row)) {
          return (
            <Input
              value={editValues.description}
              onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))}
              placeholder="Describe this property..."
              className="h-7 text-xs"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          );
        }
        return (
          <span className="text-sm text-muted-foreground">
            {row.description || <span className="italic opacity-40">No description</span>}
          </span>
        );
      },
    },
    {
      key: 'tags',
      header: 'Tags',
      hideOnMobile: true,
      render: (row) => {
        if (editingRow === rowKey(row)) {
          return (
            <Input
              value={editValues.tags}
              onChange={(e) => setEditValues((v) => ({ ...v, tags: e.target.value }))}
              placeholder="tag1, tag2"
              className="h-7 text-xs"
              onClick={(e) => e.stopPropagation()}
            />
          );
        }
        return (
          <div className="flex flex-wrap gap-1">
            {(row.tags ?? []).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-28 text-right',
      className: 'text-right',
      render: (row) => {
        if (editingRow === rowKey(row)) {
          return (
            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <Button
                size="xs"
                variant="default"
                onClick={() => saveEdit(row)}
                disabled={upsertMutation.isPending}
              >
                Save
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={cancelEdit}
              >
                Cancel
              </Button>
            </div>
          );
        }
        return (
          <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => startEdit(row)}
            >
              Edit
            </Button>
          </div>
        );
      },
    },
  ], [editingRow, editValues, rowKey, startEdit, cancelEdit, saveEdit, upsertMutation.isPending]);

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold">Properties</h2>

      <div className="flex items-center gap-3">
        <Input
          placeholder="Search properties..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex gap-1">
          {(['all', 'event', 'person'] as const).map((t) => (
            <Button
              key={t}
              size="xs"
              variant={typeFilter === t ? 'default' : 'ghost'}
              onClick={() => setTypeFilter(t)}
              className="capitalize"
            >
              {t === 'all' ? 'All' : t}
            </Button>
          ))}
        </div>
        {filtered && (
          <span className="text-sm text-muted-foreground">
            {filtered.length} propert{filtered.length !== 1 ? 'ies' : 'y'}
          </span>
        )}
      </div>

      {isLoading && <ListSkeleton count={5} />}

      {!isLoading && filtered && filtered.length === 0 && (
        <EmptyState
          icon={Database}
          title="No properties found"
          description={search ? 'No properties match your search' : 'No properties found for this event'}
        />
      )}

      {!isLoading && filtered && filtered.length > 0 && (
        <DataTable
          columns={columns}
          data={filtered}
          rowKey={rowKey}
        />
      )}
    </div>
  );
}
