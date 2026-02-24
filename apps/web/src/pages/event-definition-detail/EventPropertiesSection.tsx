import { useState, useCallback, useMemo } from 'react';
import { Database } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { usePropertyDefinitions, useUpsertPropertyDefinition } from '@/hooks/use-property-definitions';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './translations';
import type { PropertyDefinition } from '@/api/generated/Api';

export function EventPropertiesSection({ eventName }: { eventName: string }) {
  const { t } = useLocalTranslation(translations);
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
      toast.success(t('propertyUpdated'));
      setEditingRow(null);
    } catch {
      toast.error(t('propertyUpdateFailed'));
    }
  }, [editValues, upsertMutation, t]);

  const typeFilterLabels: Record<'all' | 'event' | 'person', string> = useMemo(() => ({
    all: t('all'),
    event: t('event'),
    person: t('person'),
  }), [t]);

  const columns: Column<PropertyDefinition>[] = useMemo(() => [
    {
      key: 'property_name',
      header: t('property'),
      render: (row) => (
        <span className="font-mono text-sm text-foreground">{row.property_name}</span>
      ),
    },
    {
      key: 'property_type',
      header: t('type'),
      headerClassName: 'w-24',
      hideOnMobile: true,
      render: (row) => (
        <Badge variant="outline" className="text-xs capitalize">
          {row.property_type}
        </Badge>
      ),
    },
    {
      key: 'value_type',
      header: t('valueType'),
      headerClassName: 'w-28',
      hideOnMobile: true,
      render: (row) => (
        <Badge variant="outline" className="text-xs">
          {row.value_type ?? 'String'}
        </Badge>
      ),
    },
    {
      key: 'description',
      header: t('description'),
      hideOnMobile: true,
      render: (row) => {
        if (editingRow === rowKey(row)) {
          return (
            <Input
              value={editValues.description}
              onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))}
              placeholder={t('describeProperty')}
              className="h-7 text-xs"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          );
        }
        return (
          <span className="text-sm text-muted-foreground">
            {row.description || <span className="italic opacity-40">{t('noDescription')}</span>}
          </span>
        );
      },
    },
    {
      key: 'tags',
      header: t('tagsLabel'),
      hideOnMobile: true,
      render: (row) => {
        if (editingRow === rowKey(row)) {
          return (
            <Input
              value={editValues.tags}
              onChange={(e) => setEditValues((v) => ({ ...v, tags: e.target.value }))}
              placeholder={t('tagPlaceholder')}
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
                {t('save')}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={cancelEdit}
              >
                {t('cancel')}
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
              {t('edit')}
            </Button>
          </div>
        );
      },
    },
  ], [t, editingRow, editValues, rowKey, startEdit, cancelEdit, saveEdit, upsertMutation.isPending]);

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold">{t('properties')}</h2>

      <div className="flex items-center gap-3">
        <Input
          placeholder={t('searchProperties')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex gap-1">
          {(['all', 'event', 'person'] as const).map((filterType) => (
            <Button
              key={filterType}
              size="xs"
              variant={typeFilter === filterType ? 'default' : 'ghost'}
              onClick={() => setTypeFilter(filterType)}
              className="capitalize"
            >
              {typeFilterLabels[filterType]}
            </Button>
          ))}
        </div>
        {filtered && (
          <span className="text-sm text-muted-foreground">
            {filtered.length !== 1
              ? t('propertyCountPlural', { count: filtered.length })
              : t('propertyCount', { count: filtered.length })}
          </span>
        )}
      </div>

      {isLoading && <ListSkeleton count={5} />}

      {!isLoading && filtered && filtered.length === 0 && (
        <EmptyState
          icon={Database}
          title={t('noPropertiesFound')}
          description={search ? t('noPropertiesMatch') : t('noPropertiesEvent')}
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
