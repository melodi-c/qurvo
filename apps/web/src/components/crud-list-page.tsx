import type { ElementType } from 'react';
import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { toast } from 'sonner';

interface CrudListRow {
  id: string;
  name: string;
  description?: string | null;
}

interface CrudListPageProps<T extends CrudListRow> {
  title: string;
  icon: ElementType;
  linkNew: string;
  linkDetail: (id: string) => string;
  newLabel: string;
  entityLabel: string;
  columns: Column<T>[];
  data: T[] | undefined;
  isLoading: boolean;
  onDelete: (id: string) => Promise<void>;
  emptyTitle: string;
  emptyDescription: string;
  showEmptyAction?: boolean;
}

export function CrudListPage<T extends CrudListRow>({
  title,
  icon,
  linkNew,
  linkDetail,
  newLabel,
  entityLabel,
  columns: extraColumns,
  data,
  isLoading,
  onDelete,
  emptyTitle,
  emptyDescription,
  showEmptyAction = true,
}: CrudListPageProps<T>) {
  const { projectId } = useAppNavigate();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await onDelete(deleteTarget.id);
      toast.success(`${entityLabel.charAt(0).toUpperCase() + entityLabel.slice(1)} deleted`);
    } catch {
      toast.error(`Failed to delete ${entityLabel}`);
    }
  }, [deleteTarget, onDelete, entityLabel]);

  const nameColumn: Column<T> = {
    key: 'name',
    header: 'Name',
    render: (row) => (
      <div>
        <span className="font-medium text-foreground">{row.name}</span>
        {row.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[300px]">
            {row.description}
          </p>
        )}
      </div>
    ),
  };

  const actionsColumn: Column<T> = {
    key: 'actions',
    header: 'Actions',
    headerClassName: 'text-right w-24',
    className: 'text-right',
    render: (row) => (
      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        <Link to={linkDetail(row.id)}>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => setDeleteTarget({ id: row.id, name: row.name })}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    ),
  };

  const allColumns = [nameColumn, ...extraColumns, actionsColumn];

  return (
    <div className="space-y-6">
      <PageHeader title={title}>
        <Link to={linkNew}>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            {newLabel}
          </Button>
        </Link>
      </PageHeader>

      {!projectId && (
        <EmptyState icon={icon} description={`Select a project to view ${title.toLowerCase()}`} />
      )}

      {projectId && isLoading && <ListSkeleton />}

      {projectId && !isLoading && data && data.length === 0 && (
        <EmptyState
          icon={icon}
          title={emptyTitle}
          description={emptyDescription}
          action={showEmptyAction ? (
            <Link to={linkNew}>
              <Button size="sm">
                <Plus className="h-3.5 w-3.5 mr-1" />
                {newLabel}
              </Button>
            </Link>
          ) : undefined}
        />
      )}

      {projectId && !isLoading && data && data.length > 0 && (
        <DataTable
          columns={allColumns}
          data={data}
          rowKey={(row) => row.id}
          onRowClick={(row) => navigate(linkDetail(row.id))}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`Delete ${entityLabel} "${deleteTarget?.name}"?`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  );
}
