import { UsersRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CrudListPage } from '@/components/crud-list-page';
import { useCohorts, useDeleteCohort } from '@/features/cohorts/hooks/use-cohorts';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { NewCohortDropdown } from '@/features/cohorts/components/NewCohortDropdown';
import translations from './cohorts.translations';
import { formatDate } from '@/lib/formatting';
import { conditionsSummary } from '@/features/cohorts/lib/cohort-summary';
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
          {row.is_static ? t('static') : t('dynamic')}
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
          {formatDate(row.created_at)}
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
      newButton={<NewCohortDropdown />}
      entityLabel={t('cohortEntity')}
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

