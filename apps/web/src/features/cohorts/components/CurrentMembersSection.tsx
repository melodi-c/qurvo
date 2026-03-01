import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { getPersonFields } from '@/lib/person';
import { useStaticCohortMembers, MEMBERS_LIMIT } from '../hooks/use-cohort-members';
import translations from './CurrentMembersSection.translations';

interface MemberDisplayRow {
  id: string;
  displayId: string;
  name: string;
  email: string;
}

interface CurrentMembersSectionProps {
  cohortId: string;
}

export function CurrentMembersSection({ cohortId }: CurrentMembersSectionProps) {
  const { t } = useLocalTranslation(translations);
  const [page, setPage] = useState(0);

  const { data, isLoading, isError } = useStaticCohortMembers(cohortId, page);

  const members = data?.data ?? [];
  const total = data?.total ?? 0;

  const rows = useMemo((): MemberDisplayRow[] =>
    members.map((m) => {
      const { name, email } = getPersonFields(m.user_properties);
      return {
        id: m.person_id,
        displayId: m.person_id.slice(0, 8),
        name,
        email,
      };
    }),
    [members],
  );

  const columns = useMemo((): Column<MemberDisplayRow>[] => [
    {
      key: 'identifier',
      header: t('identifier'),
      className: 'font-mono text-xs text-muted-foreground truncate max-w-[160px]',
      render: (row) => row.displayId,
    },
    {
      key: 'name',
      header: t('name'),
      className: 'font-medium',
      render: (row) => row.name || '\u2014',
    },
    {
      key: 'email',
      header: t('email'),
      className: 'text-muted-foreground',
      hideOnMobile: true,
      render: (row) => row.email || '\u2014',
    },
  ], [t]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{t('currentMembersTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('currentMembersDescription')}</p>
        </div>
      </div>

      {isLoading && <ListSkeleton count={3} height="h-10" />}

      {isError && (
        <p className="text-sm text-destructive">{t('loadMembersFailed')}</p>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState
          icon={Users}
          description={t('noMembersDescription')}
        />
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(row) => row.id}
          page={page}
          onPageChange={setPage}
          hasMore={page * MEMBERS_LIMIT + rows.length < total}
        />
      )}
    </div>
  );
}
