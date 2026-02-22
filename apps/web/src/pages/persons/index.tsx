import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { DataTable, type Column } from '@/components/ui/data-table';
import { api } from '@/api/client';
import { useDebounce } from '@/hooks/use-debounce';
import { NO_VALUE_OPS } from '@/features/dashboard/components/widgets/funnel/StepFilterRow';
import { PersonsFilterPanel } from './PersonsFilterPanel';
import type { StepFilter } from '@/api/generated/Api';

interface PersonRow {
  id: string;
  displayId: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS: Column<PersonRow>[] = [
  {
    key: 'identifier',
    header: 'Identifier',
    className: 'font-mono text-xs text-muted-foreground truncate max-w-[160px]',
    render: (row) => row.displayId,
  },
  {
    key: 'name',
    header: 'Name',
    className: 'font-medium',
    render: (row) => row.name || '\u2014',
  },
  {
    key: 'email',
    header: 'Email',
    className: 'text-muted-foreground',
    hideOnMobile: true,
    render: (row) => row.email || '\u2014',
  },
  {
    key: 'firstSeen',
    header: 'First Seen',
    className: 'text-muted-foreground',
    hideOnMobile: true,
    render: (row) => new Date(row.createdAt).toLocaleDateString(),
  },
  {
    key: 'lastSeen',
    header: 'Last Seen',
    className: 'text-muted-foreground',
    render: (row) => new Date(row.updatedAt).toLocaleDateString(),
  },
];

export default function PersonsPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const navigate = useNavigate();
  const [filters, setFilters] = useState<StepFilter[]>([]);
  const [page, setPage] = useState(0);
  const limit = 50;

  const debouncedFilters = useDebounce(filters, 400);

  const filtersHash = useMemo(
    () => JSON.stringify(debouncedFilters),
    [debouncedFilters],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['persons', projectId, filtersHash, page],
    queryFn: () => {
      const validFilters = debouncedFilters.filter((f) => {
        if (f.property.trim() === '') return false;
        if (!NO_VALUE_OPS.has(f.operator) && (!f.value || f.value.trim() === '')) return false;
        return true;
      });
      return api.personsControllerGetPersons({
        project_id: projectId,
        ...(validFilters.length ? { filters: validFilters } : {}),
        limit,
        offset: page * limit,
      });
    },
    enabled: !!projectId,
  });

  const persons = data?.persons ?? [];
  const total = data?.total ?? 0;

  const rows: PersonRow[] = persons.map((person) => {
    const props = person.properties as Record<string, unknown>;
    return {
      id: person.id,
      displayId: person.distinct_ids[0] ?? person.id.slice(0, 8),
      name: String(props['name'] ?? props['$name'] ?? ''),
      email: String(props['email'] ?? props['$email'] ?? ''),
      createdAt: person.created_at,
      updatedAt: person.updated_at,
    };
  });

  const handleFiltersChange = useCallback((f: StepFilter[]) => {
    setFilters(f);
    setPage(0);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Persons">
        {total > 0 && (
          <span className="text-sm text-muted-foreground">{total.toLocaleString()} total</span>
        )}
      </PageHeader>

      {!projectId && (
        <EmptyState icon={Users} description="Select a project to view persons" />
      )}

      {projectId && (
        <>
          <PersonsFilterPanel
            filters={filters}
            onFiltersChange={handleFiltersChange}
          />

          {isLoading && <ListSkeleton count={8} height="h-10" className="space-y-2" />}

          {!isLoading && rows.length > 0 && (
            <DataTable
              columns={COLUMNS}
              data={rows}
              rowKey={(row) => row.id}
              onRowClick={(row) => navigate(`/persons/${row.id}?project=${projectId}`)}
              page={page}
              onPageChange={setPage}
              hasMore={page * limit + persons.length < total}
            />
          )}

          {!isLoading && rows.length === 0 && (
            <EmptyState icon={Users} description="No persons found" />
          )}
        </>
      )}
    </div>
  );
}
