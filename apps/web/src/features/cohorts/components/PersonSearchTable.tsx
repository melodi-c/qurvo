import { useState, useMemo, useCallback, type ReactNode } from 'react';
import { Search, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { getPersonFields } from '@/lib/person';
import { usePersonSearch, PERSONS_LIMIT } from '../hooks/use-cohort-members';
import translations from './MembersTab.translations';

export interface PersonRow {
  id: string;
  displayId: string;
  name: string;
  email: string;
}

function toPersonRows(persons: { id: string; distinct_ids: string[]; properties: Record<string, unknown> }[]): PersonRow[] {
  return persons.map((person) => {
    const { name, email } = getPersonFields(person.properties);
    return {
      id: person.id,
      displayId: person.distinct_ids[0] ?? person.id.slice(0, 8),
      name,
      email,
    };
  });
}

function toggleInSet(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

interface PersonSearchTableProps {
  renderRowAction?: (row: PersonRow) => ReactNode;
  renderFooter?: (selected: Set<string>, clearSelection: () => void) => ReactNode;
}

export function PersonSearchTable({ renderRowAction, renderFooter }: PersonSearchTableProps) {
  const { t } = useLocalTranslation(translations);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading } = usePersonSearch(search, page);

  const persons = data?.persons ?? [];
  const total = data?.total ?? 0;
  const rows = useMemo(() => toPersonRows(persons), [persons]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => toggleInSet(prev, id));
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(0);
  }, []);

  const columns = useMemo((): Column<PersonRow>[] => {
    const base: Column<PersonRow>[] = [
      {
        key: 'select',
        header: '',
        className: 'w-10',
        render: (row) => (
          <input
            type="checkbox"
            checked={selected.has(row.id)}
            onChange={() => toggleSelect(row.id)}
            aria-label={t('selectPerson', { id: row.displayId })}
            className="accent-primary h-4 w-4 cursor-pointer"
          />
        ),
      },
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
    ];

    if (renderRowAction) {
      base.push({
        key: 'actions',
        header: '',
        className: 'w-10',
        render: renderRowAction,
      });
    }

    return base;
  }, [selected, toggleSelect, renderRowAction, t]);

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="pl-9 h-9"
        />
      </div>

      {isLoading && <ListSkeleton count={3} height="h-10" />}

      {!isLoading && rows.length === 0 && (
        <EmptyState
          icon={Users}
          description={t('noPersonsFoundDescription')}
        />
      )}

      {!isLoading && rows.length > 0 && (
        <>
          <DataTable
            columns={columns}
            data={rows}
            rowKey={(row) => row.id}
            onRowClick={(row) => toggleSelect(row.id)}
            page={page}
            onPageChange={setPage}
            hasMore={page * PERSONS_LIMIT + persons.length < total}
          />
          {renderFooter?.(selected, clearSelection)}
        </>
      )}
    </>
  );
}
