import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { UsersRound, Plus, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable, type Column } from '@/components/ui/data-table';
import { useCohorts, useDeleteCohort } from '@/features/cohorts/hooks/use-cohorts';
import { toast } from 'sonner';
import type { Cohort } from '@/api/generated/Api';

function conditionsSummary(definition: { match: string; conditions: Array<{ type: string; [k: string]: unknown }> }): string {
  const parts = definition.conditions.map((c) => {
    if (c.type === 'person_property') return `${c.property} ${c.operator} ${c.value ?? ''}`.trim();
    if (c.type === 'event') return `${c.event_name} ${c.count_operator} ${c.count}x / ${c.time_window_days}d`;
    return '?';
  });
  const joiner = definition.match === 'all' ? ' AND ' : ' OR ';
  return parts.join(joiner) || 'No conditions';
}

export default function CohortsPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const navigate = useNavigate();
  const { data: cohorts, isLoading } = useCohorts();
  const deleteMutation = useDeleteCohort();
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!confirm(`Delete cohort "${name}"?`)) return;
    setDeleting(id);
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Cohort deleted');
    } catch {
      toast.error('Failed to delete cohort');
    } finally {
      setDeleting(null);
    }
  };

  const columns: Column<Cohort>[] = [
    {
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
    },
    {
      key: 'conditions',
      header: 'Conditions',
      render: (row) => (
        <span className="text-xs text-muted-foreground font-mono truncate block max-w-[300px]">
          {conditionsSummary(row.definition as any)}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right w-24',
      className: 'text-right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Link to={`/cohorts/${row.id}?project=${projectId}`}>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            disabled={deleting === row.id}
            onClick={(e) => handleDelete(e, row.id, row.name)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">Cohorts</h1>
        <Link to={`/cohorts/new?project=${projectId}`}>
          <Button size="sm" className="h-8 text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" />
            New cohort
          </Button>
        </Link>
      </div>

      {/* No project selected */}
      {!projectId && (
        <div className="flex flex-col items-center justify-center gap-3 text-center py-16">
          <UsersRound className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Select a project to view cohorts</p>
        </div>
      )}

      {/* Loading */}
      {projectId && isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {/* Empty */}
      {projectId && !isLoading && cohorts && cohorts.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 text-center py-16">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <UsersRound className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">No cohorts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a cohort to group users by properties or behavior
            </p>
          </div>
        </div>
      )}

      {/* List */}
      {projectId && !isLoading && cohorts && cohorts.length > 0 && (
        <DataTable
          columns={columns}
          data={cohorts}
          rowKey={(row) => row.id}
          onRowClick={(row) => navigate(`/cohorts/${row.id}?project=${projectId}`)}
        />
      )}
    </div>
  );
}
