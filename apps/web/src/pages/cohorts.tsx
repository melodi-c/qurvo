import { UsersRound } from 'lucide-react';
import { CrudListPage } from '@/components/crud-list-page';
import { useCohorts, useDeleteCohort } from '@/features/cohorts/hooks/use-cohorts';
import type { Column } from '@/components/ui/data-table';
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

const extraColumns: Column<Cohort>[] = [
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
];

export default function CohortsPage() {
  const { data: cohorts, isLoading } = useCohorts();
  const deleteMutation = useDeleteCohort();

  return (
    <CrudListPage
      title="Cohorts"
      icon={UsersRound}
      basePath="/cohorts"
      newLabel="New cohort"
      entityLabel="cohort"
      columns={extraColumns}
      data={cohorts}
      isLoading={isLoading}
      onDelete={(id) => deleteMutation.mutateAsync(id)}
      emptyTitle="No cohorts yet"
      emptyDescription="Create a cohort to group users by properties or behavior"
      showEmptyAction={false}
    />
  );
}
