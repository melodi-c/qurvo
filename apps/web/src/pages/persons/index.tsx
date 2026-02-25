import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { DataTable, type Column } from '@/components/ui/data-table';
import { api } from '@/api/client';
import { getPersonFields } from '@/lib/person';
import { useDebounce } from '@/hooks/use-debounce';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { isValidFilter } from '@/lib/filter-utils';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './index.translations';
import { PersonsFilterPanel } from './PersonsFilterPanel';
import { usePersonsFilters } from './use-persons-filters';

interface PersonRow {
  id: string;
  displayId: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export default function PersonsPage() {
  const { t } = useLocalTranslation(translations);
  const { go, projectId } = useAppNavigate();

  const {
    filterState,
    page,
    setPage,
    handleSearchChange,
    handleFiltersChange,
  } = usePersonsFilters();

  const limit = 50;

  const debouncedState = useDebounce(filterState, 400);

  const stateHash = useMemo(
    () => JSON.stringify(debouncedState),
    [debouncedState],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['persons', projectId, stateHash, page],
    queryFn: () => {
      const validFilters = debouncedState.filters.filter(isValidFilter);
      return api.personsControllerGetPersons({
        project_id: projectId,
        ...(debouncedState.search ? { search: debouncedState.search } : {}),
        ...(validFilters.length ? { filters: validFilters } : {}),
        limit,
        offset: page * limit,
      });
    },
    enabled: !!projectId,
  });

  const persons = data?.persons ?? [];
  const total = data?.total ?? 0;

  const columns: Column<PersonRow>[] = useMemo(() => [
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
    {
      key: 'firstSeen',
      header: t('firstSeen'),
      className: 'text-muted-foreground',
      hideOnMobile: true,
      render: (row) => new Date(row.createdAt).toLocaleDateString(),
    },
    {
      key: 'lastSeen',
      header: t('lastSeen'),
      className: 'text-muted-foreground',
      render: (row) => new Date(row.updatedAt).toLocaleDateString(),
    },
  ], [t]);

  const rows: PersonRow[] = useMemo(() => persons.map((person) => {
    const { name, email } = getPersonFields(person.properties);
    return {
      id: person.id,
      displayId: person.distinct_ids[0] ?? person.id.slice(0, 8),
      name,
      email,
      createdAt: person.created_at,
      updatedAt: person.updated_at,
    };
  }), [persons]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')}>
        {total > 0 && (
          <span className="text-sm text-muted-foreground">{t('total', { count: total.toLocaleString() })}</span>
        )}
      </PageHeader>

      {!projectId && (
        <EmptyState icon={Users} description={t('selectProject')} />
      )}

      {projectId && (
        <>
          <PersonsFilterPanel
            search={filterState.search}
            onSearchChange={handleSearchChange}
            filters={filterState.filters}
            onFiltersChange={handleFiltersChange}
          />

          {isLoading && <ListSkeleton count={8} height="h-10" className="space-y-2" />}

          {!isLoading && rows.length > 0 && (
            <DataTable
              columns={columns}
              data={rows}
              rowKey={(row) => row.id}
              onRowClick={(row) => go.persons.detail(row.id)}
              page={page}
              onPageChange={setPage}
              hasMore={page * limit + persons.length < total}
            />
          )}

          {!isLoading && rows.length === 0 && (
            <EmptyState icon={Users} description={t('noPersons')} />
          )}
        </>
      )}
    </div>
  );
}
