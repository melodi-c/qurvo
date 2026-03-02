import { useState, useMemo, useCallback } from 'react';
import { StickyNote, Plus, Pencil, Trash2, AlertTriangle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AnnotationDialog } from '@/components/ui/annotation-dialog';
import { PillToggleGroup } from '@/components/ui/pill-toggle-group';
import { RequireProject } from '@/components/require-project';
import { useAnnotations, useCreateAnnotation, useUpdateAnnotation, useDeleteAnnotation } from '@/features/dashboard/hooks/use-annotations';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { formatDate } from '@/lib/formatting';
import translations from './annotations.translations';
import type { Annotation, CreateAnnotation, UpdateAnnotation } from '@/api/generated/Api';

type ScopeFilter = 'all' | 'project' | 'insight';

export default function AnnotationsPage() {
  const { t } = useLocalTranslation(translations);
  const { link } = useAppNavigate();

  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | undefined>(undefined);

  const { data: annotations, isLoading } = useAnnotations();
  const createMutation = useCreateAnnotation();
  const updateMutation = useUpdateAnnotation();
  const deleteMutation = useDeleteAnnotation();
  const confirmDelete = useConfirmDelete();

  const scopeOptions = useMemo(
    () => [
      { label: t('allScopes'), value: 'all' as ScopeFilter },
      { label: t('projectScope'), value: 'project' as ScopeFilter },
      { label: t('insightScope'), value: 'insight' as ScopeFilter },
    ],
    [t],
  );

  const filtered = useMemo(() => {
    if (!annotations) {return undefined;}
    return annotations.filter((a) => {
      if (scopeFilter !== 'all' && a.scope !== scopeFilter) {return false;}
      if (search) {
        const q = search.toLowerCase();
        return (
          a.label.toLowerCase().includes(q) ||
          (a.description ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [annotations, search, scopeFilter]);

  const handleCreate = useCallback(async (data: CreateAnnotation) => {
    await createMutation.mutateAsync(data);
    toast.success(t('annotationCreated'));
  }, [createMutation, t]);

  const handleUpdate = useCallback(async (data: CreateAnnotation) => {
    if (!editingAnnotation) {return;}
    const updateData: UpdateAnnotation = {
      date: data.date,
      label: data.label,
      description: data.description,
      color: data.color,
    };
    await updateMutation.mutateAsync({ id: editingAnnotation.id, data: updateData });
    toast.success(t('annotationUpdated'));
  }, [editingAnnotation, updateMutation, t]);

  const handleDelete = useCallback(async () => {
    await deleteMutation.mutateAsync(confirmDelete.itemId);
    toast.success(t('annotationDeleted'));
  }, [deleteMutation, confirmDelete.itemId, t]);

  const openCreateDialog = useCallback(() => {
    setEditingAnnotation(undefined);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((annotation: Annotation) => {
    setEditingAnnotation(annotation);
    setDialogOpen(true);
  }, []);

  const columns: Column<Annotation>[] = useMemo(
    () => [
      {
        key: 'label',
        header: t('columnLabel'),
        render: (row) => (
          <div className="flex items-center gap-2">
            {row.color && (
              <span
                className="inline-block size-3 rounded-full shrink-0"
                style={{ backgroundColor: row.color }}
              />
            )}
            <span className="font-medium text-sm text-foreground">{row.label}</span>
          </div>
        ),
      },
      {
        key: 'date',
        header: t('columnDate'),
        headerClassName: 'w-32',
        hideOnMobile: true,
        render: (row) => (
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatDate(row.date)}
          </span>
        ),
      },
      {
        key: 'scope',
        header: t('columnScope'),
        headerClassName: 'w-32',
        hideOnMobile: true,
        render: (row) => (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {row.scope === 'insight' ? t('scopeInsight') : t('scopeProject')}
            </Badge>
            {row.scope === 'insight' && row.insight_id && (
              <Link
                to={link.insights.list()}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title={t('viewInsight')}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="size-3.5" />
              </Link>
            )}
          </div>
        ),
      },
      {
        key: 'created_at',
        header: t('columnCreatedAt'),
        headerClassName: 'w-36',
        hideOnMobile: true,
        render: (row) => (
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatDate(row.created_at)}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '',
        headerClassName: 'w-20',
        render: (row) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                openEditDialog(row);
              }}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                confirmDelete.requestDelete(row.id, row.label);
              }}
            >
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [t, link, openEditDialog, confirmDelete],
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')}>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="size-4 mr-1.5" />
          {t('newAnnotation')}
        </Button>
      </PageHeader>

      <RequireProject icon={StickyNote} description={t('selectProject')}>
        {isLoading && <ListSkeleton count={6} />}

        {!isLoading && !annotations && (
          <EmptyState
            icon={AlertTriangle}
            description={t('errorLoading')}
            action={
              <Button variant="outline" onClick={() => window.location.reload()}>
                {t('retry')}
              </Button>
            }
          />
        )}

        {!isLoading && annotations && (
          <>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Input
                placeholder={t('searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />
              <PillToggleGroup
                options={scopeOptions}
                value={scopeFilter}
                onChange={setScopeFilter}
              />
              {filtered && (
                <span className="text-sm text-muted-foreground ml-auto">
                  {filtered.length === 1
                    ? t('countSingular', { count: filtered.length })
                    : t('countPlural', { count: filtered.length })}
                </span>
              )}
            </div>

            {filtered?.length === 0 && (
              <EmptyState
                icon={StickyNote}
                title={search || scopeFilter !== 'all' ? undefined : t('noAnnotations')}
                description={
                  search || scopeFilter !== 'all'
                    ? t('noAnnotationsMatch')
                    : t('noAnnotationsDescription')
                }
                action={
                  !search && scopeFilter === 'all' ? (
                    <Button variant="outline" onClick={openCreateDialog}>
                      <Plus className="size-4 mr-1.5" />
                      {t('newAnnotation')}
                    </Button>
                  ) : undefined
                }
              />
            )}

            {filtered && filtered.length > 0 && (
              <DataTable
                columns={columns}
                data={filtered}
                rowKey={(row) => row.id}
                onRowClick={openEditDialog}
              />
            )}
          </>
        )}
      </RequireProject>

      <AnnotationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        annotation={editingAnnotation}
        onSave={editingAnnotation ? handleUpdate : handleCreate}
      />

      <ConfirmDialog
        open={confirmDelete.isOpen}
        onOpenChange={confirmDelete.close}
        title={t('deleteTitle')}
        description={t('deleteDescription', { name: confirmDelete.itemName })}
        onConfirm={handleDelete}
      />
    </div>
  );
}
