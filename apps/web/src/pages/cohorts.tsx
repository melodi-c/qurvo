import { UsersRound } from 'lucide-react';
import { CrudListPage } from '@/components/crud-list-page';
import { useCohorts, useDeleteCohort } from '@/features/cohorts/hooks/use-cohorts';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './cohorts.translations';
import type { Column } from '@/components/ui/data-table';
import type { Cohort } from '@/api/generated/Api';

export default function CohortsPage() {
  const { data: cohorts, isLoading } = useCohorts();
  const deleteMutation = useDeleteCohort();
  const { link } = useAppNavigate();
  const { t } = useLocalTranslation(translations);

  const extraColumns: Column<Cohort>[] = [
    {
      key: 'conditions',
      header: t('conditions'),
      render: (row) => (
        <span className="text-xs text-muted-foreground font-mono truncate block max-w-[300px]">
          {conditionsSummary(row.definition as any, t('noConditions'))}
        </span>
      ),
    },
    {
      key: 'created',
      header: t('created'),
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.created_at).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <CrudListPage
      title={t('title')}
      icon={UsersRound}
      linkNew={link.cohorts.new()}
      linkDetail={(id) => link.cohorts.detail(id)}
      newLabel={t('newCohort')}
      entityLabel="cohort"
      columns={extraColumns}
      data={cohorts}
      isLoading={isLoading}
      onDelete={(id) => deleteMutation.mutateAsync(id)}
      emptyTitle={t('noYet')}
      emptyDescription={t('noYetDescription')}
      showEmptyAction={false}
    />
  );
}

function conditionsSummary(
  definition: { match: string; conditions: Array<{ type: string; [k: string]: unknown }> },
  noConditionsLabel: string,
): string {
  const parts = definition.conditions.map((c) => {
    if (c.type === 'person_property') return `${c.property} ${c.operator} ${c.value ?? ''}`.trim();
    if (c.type === 'event') return `${c.event_name} ${c.count_operator} ${c.count}x / ${c.time_window_days}d`;
    return '?';
  });
  const joiner = definition.match === 'all' ? ' AND ' : ' OR ';
  return parts.join(joiner) || noConditionsLabel;
}
