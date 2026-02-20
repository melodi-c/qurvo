import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GitFork, Plus, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable, type Column } from '@/components/ui/data-table';
import { useInsights, useDeleteInsight } from '@/features/insights/hooks/use-insights';
import { toast } from 'sonner';
import type { Insight, FunnelWidgetConfig } from '@/api/generated/Api';

function stepsSummary(insight: Insight): string {
  const config = insight.config as FunnelWidgetConfig;
  if (!config.steps?.length) return '\u2014';
  return config.steps.map((s) => s.event_name).join(' \u2192 ');
}

export default function FunnelsPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const navigate = useNavigate();
  const { data: insights, isLoading } = useInsights('funnel');
  const deleteMutation = useDeleteInsight();
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!confirm(`Delete funnel "${name}"?`)) return;
    setDeleting(id);
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Funnel deleted');
    } catch {
      toast.error('Failed to delete funnel');
    } finally {
      setDeleting(null);
    }
  };

  const columns: Column<Insight>[] = [
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
      key: 'steps',
      header: 'Steps',
      render: (row) => (
        <span className="text-xs text-muted-foreground font-mono truncate block max-w-[300px]">
          {stepsSummary(row)}
        </span>
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.updated_at).toLocaleDateString()}
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
          <Link to={`/funnels/${row.id}?project=${projectId}`}>
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
        <h1 className="text-base font-semibold">Funnels</h1>
        <Link to={`/funnels/new?project=${projectId}`}>
          <Button size="sm" className="h-8 text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" />
            New funnel
          </Button>
        </Link>
      </div>

      {/* No project */}
      {!projectId && (
        <div className="flex flex-col items-center justify-center gap-3 text-center py-16">
          <GitFork className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Select a project to view funnels</p>
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
      {projectId && !isLoading && insights && insights.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 text-center py-16">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <GitFork className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">No funnels yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a funnel to measure conversion through event sequences
            </p>
          </div>
          <Link to={`/funnels/new?project=${projectId}`}>
            <Button size="sm">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Create first funnel
            </Button>
          </Link>
        </div>
      )}

      {/* List */}
      {projectId && !isLoading && insights && insights.length > 0 && (
        <DataTable
          columns={columns}
          data={insights}
          rowKey={(row) => row.id}
          onRowClick={(row) => navigate(`/funnels/${row.id}?project=${projectId}`)}
        />
      )}
    </div>
  );
}
