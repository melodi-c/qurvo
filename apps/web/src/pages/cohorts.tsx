import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { UsersRound, Plus, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCohorts, useDeleteCohort } from '@/features/cohorts/hooks/use-cohorts';
import { toast } from 'sonner';

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
  const { data: cohorts, isLoading } = useCohorts();
  const deleteMutation = useDeleteCohort();
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string, name: string) => {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1">
            <UsersRound className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Cohorts</span>
          </div>
          <h1 className="text-base font-semibold">Cohorts</h1>
        </div>
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

      {/* Cohorts list */}
      {projectId && !isLoading && cohorts && cohorts.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-xs text-muted-foreground">
                <th className="text-left px-4 py-2.5 font-medium">Name</th>
                <th className="text-left px-4 py-2.5 font-medium">Conditions</th>
                <th className="text-left px-4 py-2.5 font-medium">Created</th>
                <th className="text-right px-4 py-2.5 font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cohorts.map((cohort) => (
                <tr key={cohort.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      to={`/cohorts/${cohort.id}?project=${projectId}`}
                      className="font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {cohort.name}
                    </Link>
                    {cohort.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[300px]">
                        {cohort.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground font-mono truncate block max-w-[300px]">
                      {conditionsSummary(cohort.definition as any)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(cohort.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link to={`/cohorts/${cohort.id}?project=${projectId}`}>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        disabled={deleting === cohort.id}
                        onClick={() => handleDelete(cohort.id, cohort.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
