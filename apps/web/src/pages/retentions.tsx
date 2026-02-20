import { CalendarCheck } from 'lucide-react';
import { CrudListPage } from '@/components/crud-list-page';
import { useInsights, useDeleteInsight } from '@/features/insights/hooks/use-insights';
import type { Column } from '@/components/ui/data-table';
import type { Insight, RetentionWidgetConfig } from '@/api/generated/Api';

const extraColumns: Column<Insight>[] = [
  {
    key: 'target_event',
    header: 'Event',
    render: (row) => {
      const config = row.config as RetentionWidgetConfig;
      return (
        <span className="text-xs text-muted-foreground font-mono truncate block max-w-[200px]">
          {config.target_event || '\u2014'}
        </span>
      );
    },
  },
  {
    key: 'retention_type',
    header: 'Type',
    render: (row) => {
      const config = row.config as RetentionWidgetConfig;
      return (
        <span className="text-xs text-muted-foreground">
          {config.retention_type === 'first_time' ? 'First time' : 'Recurring'}
        </span>
      );
    },
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

export default function RetentionsPage() {
  const { data: insights, isLoading } = useInsights('retention');
  const deleteMutation = useDeleteInsight();

  return (
    <CrudListPage
      title="Retention"
      icon={CalendarCheck}
      basePath="/retentions"
      newLabel="New retention"
      entityLabel="retention"
      columns={extraColumns}
      data={insights}
      isLoading={isLoading}
      onDelete={(id) => deleteMutation.mutateAsync(id)}
      emptyTitle="No retention insights yet"
      emptyDescription="Create your first retention insight to see how users come back over time"
    />
  );
}
