import { UsersRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CrudListPage } from '@/components/crud-list-page';
import { useCohorts, useDeleteCohort } from '@/features/cohorts/hooks/use-cohorts';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './cohorts.translations';
import { isGroup, type CohortCondition, type CohortConditionGroup } from '@/features/cohorts/types';
import type { Column } from '@/components/ui/data-table';
import type { Cohort } from '@/api/generated/Api';

export default function CohortsPage() {
  const { data: cohorts, isLoading } = useCohorts();
  const deleteMutation = useDeleteCohort();
  const { link } = useAppNavigate();
  const { t } = useLocalTranslation(translations);

  const extraColumns: Column<Cohort>[] = [
    {
      key: 'type',
      header: t('type'),
      render: (row) => (
        <Badge variant="secondary" className="text-[10px]">
          {(row as any).is_static ? t('static') : t('dynamic')}
        </Badge>
      ),
    },
    {
      key: 'conditions',
      header: t('conditions'),
      render: (row) => (
        <span className="text-xs text-muted-foreground font-mono truncate block max-w-[300px]">
          {conditionsSummary(row.definition, t('noConditions'))}
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

function conditionsSummary(definition: unknown, noConditionsLabel: string): string {
  try {
    const root = definition as CohortConditionGroup;
    if (!root || !root.values) return noConditionsLabel;
    return groupSummary(root) || noConditionsLabel;
  } catch {
    return noConditionsLabel;
  }
}

function groupSummary(group: CohortConditionGroup): string {
  const parts = group.values.map((v) => {
    if (isGroup(v)) return `(${groupSummary(v)})`;
    return condSummary(v as CohortCondition);
  });
  const joiner = group.type === 'AND' ? ' AND ' : ' OR ';
  return parts.filter(Boolean).join(joiner);
}

function condSummary(c: CohortCondition): string {
  switch (c.type) {
    case 'person_property':
      return `${c.property} ${c.operator} ${c.value ?? ''}`.trim();
    case 'event':
      return `${c.event_name} ${c.count_operator} ${c.count}x / ${c.time_window_days}d`;
    case 'cohort':
      return `${c.negated ? 'NOT ' : ''}cohort:${c.cohort_id.slice(0, 8)}`;
    case 'first_time_event':
      return `first(${c.event_name}) / ${c.time_window_days}d`;
    case 'not_performed_event':
      return `!${c.event_name} / ${c.time_window_days}d`;
    case 'event_sequence':
      return `seq(${c.steps.map((s) => s.event_name).join(' > ')})`;
    case 'not_performed_event_sequence':
      return `!seq(${c.steps.map((s) => s.event_name).join(' > ')})`;
    case 'performed_regularly':
      return `reg(${c.event_name}) ${c.min_periods}/${c.total_periods}`;
    case 'stopped_performing':
      return `stopped(${c.event_name})`;
    case 'restarted_performing':
      return `restarted(${c.event_name})`;
  }
}
