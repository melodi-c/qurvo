import { useState, useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PillToggleGroup } from '@/components/ui/pill-toggle-group';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { api } from '@/api/client';
import { useProjectId } from '@/hooks/use-project-id';
import { usePropertyDefinitions, useUpsertPropertyDefinition, propertyDefinitionsKey } from '@/hooks/use-property-definitions';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useInlineEdit } from '@/hooks/use-inline-edit';
import translations from './translations';
import type { PropertyDefinition } from '@/api/generated/Api';

interface PropertyEditValues {
  description: string;
  tags: string;
}

export function EventPropertiesSection({ eventName }: { eventName: string }) {
  const { t } = useLocalTranslation(translations);
  const projectId = useProjectId();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'event' | 'person'>('all');

  const type = typeFilter === 'all' ? undefined : typeFilter;
  const { data: definitions, isLoading } = usePropertyDefinitions(type, eventName);
  const upsertMutation = useUpsertPropertyDefinition();
  const confirmDelete = useConfirmDelete();

  const deleteMutation = useMutation({
    mutationFn: ({ propertyType, propertyName }: { propertyType: string; propertyName: string }) =>
      api.propertyDefinitionsControllerRemove({ projectId, propertyType, propertyName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: propertyDefinitionsKey(projectId) }),
  });

  const handleDeleteProperty = useCallback(async () => {
    const def = definitions?.find(
      (d) => `${d.property_name}:${d.property_type}` === confirmDelete.itemId,
    );
    if (!def) return;
    try {
      await deleteMutation.mutateAsync({
        propertyType: def.property_type,
        propertyName: def.property_name,
      });
      toast.success(t('propertyDeleted'));
    } catch {
      toast.error(t('propertyDeleteFailed'));
    }
  }, [definitions, confirmDelete.itemId, deleteMutation, t]);

  const rowKey = useCallback(
    (row: PropertyDefinition) => `${row.property_name}:${row.property_type}`,
    [],
  );

  const getInitialValues = useCallback(
    (row: PropertyDefinition): PropertyEditValues => ({
      description: row.description ?? '',
      tags: (row.tags ?? []).join(', '),
    }),
    [],
  );

  const handleSave = useCallback(
    async (row: PropertyDefinition, values: PropertyEditValues) => {
      const parsedTags = values.tags.split(',').map((s) => s.trim()).filter(Boolean);
      try {
        await upsertMutation.mutateAsync({
          propertyName: row.property_name,
          propertyType: row.property_type,
          data: {
            description: values.description || undefined,
            tags: parsedTags,
          },
        });
        toast.success(t('propertyUpdated'));
      } catch (err) {
        toast.error(t('propertyUpdateFailed'));
        throw err;
      }
    },
    [upsertMutation, t],
  );

  const { editValues, setEditValues, isEditing, startEdit, cancelEdit, saveEdit } =
    useInlineEdit<PropertyDefinition, PropertyEditValues>({
      rowKey,
      getInitialValues,
      onSave: handleSave,
    });

  const filtered = useMemo(() => {
    if (!definitions) return undefined;
    return definitions.filter((d) =>
      !search || d.property_name.toLowerCase().includes(search.toLowerCase()),
    );
  }, [definitions, search]);

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
        if (isEditing(row)) {
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
        if (isEditing(row)) {
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
      headerClassName: 'w-36 text-right',
      className: 'text-right',
      render: (row) => {
        if (isEditing(row)) {
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
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => startEdit(row)}
            >
              {t('edit')}
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => confirmDelete.requestDelete(
                `${row.property_name}:${row.property_type}`,
                row.property_name,
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
    },
  ], [t, editValues, isEditing, startEdit, cancelEdit, saveEdit, upsertMutation.isPending, confirmDelete]);

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
        <PillToggleGroup
          options={[
            { value: 'all', label: typeFilterLabels.all },
            { value: 'event', label: typeFilterLabels.event },
            { value: 'person', label: typeFilterLabels.person },
          ]}
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as 'all' | 'event' | 'person')}
        />
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

      <ConfirmDialog
        open={confirmDelete.isOpen}
        onOpenChange={confirmDelete.close}
        title={t('deletePropertyConfirm', { name: confirmDelete.itemName })}
        description={t('deletePropertyDescription')}
        confirmLabel={t('deleteProperty')}
        cancelLabel={t('cancel')}
        variant="destructive"
        onConfirm={handleDeleteProperty}
      />
    </div>
  );
}
