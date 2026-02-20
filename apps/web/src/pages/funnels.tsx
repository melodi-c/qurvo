import { GitFork } from 'lucide-react';
import { CrudListPage } from '@/components/crud-list-page';
import { useInsights, useDeleteInsight } from '@/features/insights/hooks/use-insights';
import type { Column } from '@/components/ui/data-table';
import type { Insight, FunnelWidgetConfig } from '@/api/generated/Api';

function stepsSummary(insight: Insight): string {
  const config = insight.config as FunnelWidgetConfig;
  if (!config.steps?.length) return '\u2014';
  return config.steps.map((s) => s.event_name).join(' \u2192 ');
}

const extraColumns: Column<Insight>[] = [
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
];

export default function FunnelsPage() {
  const { data: insights, isLoading } = useInsights('funnel');
  const deleteMutation = useDeleteInsight();

  return (
    <CrudListPage
      title="Funnels"
      icon={GitFork}
      basePath="/funnels"
      newLabel="New funnel"
      entityLabel="funnel"
      columns={extraColumns}
      data={insights}
      isLoading={isLoading}
      onDelete={(id) => deleteMutation.mutateAsync(id)}
      emptyTitle="No funnels yet"
      emptyDescription="Create a funnel to measure conversion through event sequences"
    />
  );
}
