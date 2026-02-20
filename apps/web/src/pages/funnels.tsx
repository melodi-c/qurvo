import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GitFork, Plus, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
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
      <PageHeader title="Funnels">
        <Link to={`/funnels/new?project=${projectId}`}>
          <Button size="sm" className="h-8 text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" />
            New funnel
          </Button>
        </Link>
      </PageHeader>

      {!projectId && (
        <EmptyState icon={GitFork} description="Select a project to view funnels" />
      )}

      {projectId && isLoading && <ListSkeleton />}

      {projectId && !isLoading && insights && insights.length === 0 && (
        <EmptyState
          icon={GitFork}
          title="No funnels yet"
          description="Create a funnel to measure conversion through event sequences"
          action={
            <Link to={`/funnels/new?project=${projectId}`}>
              <Button size="sm">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Create first funnel
              </Button>
            </Link>
          }
        />
      )}

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
