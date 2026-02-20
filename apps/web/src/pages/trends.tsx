import { TrendingUp } from 'lucide-react';
import { CrudListPage } from '@/components/crud-list-page';
import { useInsights, useDeleteInsight } from '@/features/insights/hooks/use-insights';
import type { Column } from '@/components/ui/data-table';
import type { Insight, TrendWidgetConfig } from '@/api/generated/Api';

function seriesSummary(insight: Insight): string {
  const config = insight.config as TrendWidgetConfig;
  if (!config.series?.length) return '\u2014';
  return config.series.map((s) => s.event_name).join(', ');
}

const extraColumns: Column<Insight>[] = [
  {
    key: 'series',
    header: 'Series',
    render: (row) => (
      <span className="text-xs text-muted-foreground font-mono truncate block max-w-[300px]">
        {seriesSummary(row)}
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

export default function TrendsPage() {
  const { data: insights, isLoading } = useInsights('trend');
  const deleteMutation = useDeleteInsight();

  return (
    <CrudListPage
      title="Trends"
      icon={TrendingUp}
      basePath="/trends"
      newLabel="New trend"
      entityLabel="trend"
      columns={extraColumns}
      data={insights}
      isLoading={isLoading}
      onDelete={(id) => deleteMutation.mutateAsync(id)}
      emptyTitle="No trends yet"
      emptyDescription="Create your first trend to analyze event data over time"
    />
  );
}
