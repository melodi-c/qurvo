import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Database, Check } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TabNav } from '@/components/ui/tab-nav';
import { toast } from 'sonner';
import { useEventDefinitions, useUpsertEventDefinition } from '@/features/event-definitions/hooks/use-event-definitions';
import { usePropertyDefinitions, useUpsertPropertyDefinition } from '@/features/property-definitions/hooks/use-property-definitions';
import type { EventDefinition, PropertyDefinition } from '@/api/generated/Api';

type Tab = 'events' | 'properties';

const TABS = [
  { id: 'events' as const, label: 'Events' },
  { id: 'properties' as const, label: 'Properties' },
] as const;

// ── Events Tab ───────────────────────────────────────────────────────────────

function EventsTab() {
  const [search, setSearch] = useState('');
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ description: '', tags: '', verified: false });

  const { data: definitions, isLoading } = useEventDefinitions();
  const upsertMutation = useUpsertEventDefinition();

  const filtered = useMemo(
    () => definitions?.filter((d) => d.event_name.toLowerCase().includes(search.toLowerCase())),
    [definitions, search],
  );

  const startEdit = useCallback((row: EventDefinition) => {
    setEditingRow(row.event_name);
    setEditValues({
      description: row.description ?? '',
      tags: (row.tags ?? []).join(', '),
      verified: row.verified ?? false,
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingRow(null);
  }, []);

  const saveEdit = useCallback(async (eventName: string) => {
    const tags = editValues.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      await upsertMutation.mutateAsync({
        eventName,
        data: {
          description: editValues.description || undefined,
          tags,
          verified: editValues.verified,
        },
      });
      toast.success('Event definition updated');
      setEditingRow(null);
    } catch {
      toast.error('Failed to update event definition');
    }
  }, [editValues, upsertMutation]);

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
      render: (row) => {
        if (editingRow === row.event_name) {
          return (
            <Input
              value={editValues.description}
              onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))}
              placeholder="Describe this event..."
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
        if (editingRow === row.event_name) {
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
        if (editingRow === row.event_name) {
          return (
            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <Button
                size="xs"
                variant="default"
                onClick={() => saveEdit(row.event_name)}
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
  ], [editingRow, editValues, startEdit, cancelEdit, saveEdit, upsertMutation.isPending]);

  if (isLoading) return <ListSkeleton count={8} />;

  return (
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
        />
      )}
    </>
  );
}

// ── Properties Tab ───────────────────────────────────────────────────────────

function PropertiesTab() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'event' | 'person'>('all');
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ description: '', tags: '', verified: false });

  const { data: definitions, isLoading } = usePropertyDefinitions();
  const upsertMutation = useUpsertPropertyDefinition();

  const filtered = useMemo(() => {
    if (!definitions) return undefined;
    return definitions.filter((d) => {
      if (typeFilter !== 'all' && d.property_type !== typeFilter) return false;
      if (search && !d.property_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [definitions, search, typeFilter]);

  const rowKey = useCallback((row: PropertyDefinition) => `${row.property_name}:${row.property_type}`, []);

  const startEdit = useCallback((row: PropertyDefinition) => {
    setEditingRow(rowKey(row));
    setEditValues({
      description: row.description ?? '',
      tags: (row.tags ?? []).join(', '),
      verified: row.verified ?? false,
    });
  }, [rowKey]);

  const cancelEdit = useCallback(() => {
    setEditingRow(null);
  }, []);

  const saveEdit = useCallback(async (row: PropertyDefinition) => {
    const tags = editValues.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      await upsertMutation.mutateAsync({
        propertyName: row.property_name,
        propertyType: row.property_type,
        data: {
          description: editValues.description || undefined,
          tags,
          verified: editValues.verified,
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
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-foreground">{row.property_name}</span>
          {row.verified && (
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-primary/15">
              <Check className="w-3 h-3 text-primary" />
            </span>
          )}
        </div>
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

  if (isLoading) return <ListSkeleton count={8} />;

  return (
    <>
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

      {filtered && filtered.length === 0 && (
        <EmptyState
          icon={Database}
          title="No properties found"
          description={search ? 'No properties match your search' : 'No properties have been tracked yet'}
        />
      )}

      {filtered && filtered.length > 0 && (
        <DataTable
          columns={columns}
          data={filtered}
          rowKey={rowKey}
        />
      )}
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EventDefinitionsPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const [tab, setTab] = useState<Tab>('events');

  return (
    <div className="space-y-6">
      <PageHeader title="Data Management" />

      {!projectId && (
        <EmptyState icon={Database} description="Select a project to view definitions" />
      )}

      {projectId && (
        <>
          <TabNav tabs={TABS} value={tab} onChange={setTab} />
          {tab === 'events' && <EventsTab />}
          {tab === 'properties' && <PropertiesTab />}
        </>
      )}
    </div>
  );
}
