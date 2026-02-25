import { useState, useMemo, useCallback } from 'react';
import { Search, UserPlus, UserMinus, Users, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { getPersonFields } from '@/lib/person';
import { useAddCohortMembers, useRemoveCohortMembers, usePersonSearch, PERSONS_LIMIT } from '../hooks/use-cohort-members';
import translations from './MembersTab.translations';

interface MembersTabProps {
  cohortId: string;
  memberCount: number;
}

interface PersonRow {
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

export function MembersTab({ cohortId, memberCount }: MembersTabProps) {
  const { t } = useLocalTranslation(translations);

  return (
    <div className="flex-1 overflow-auto p-6 space-y-8">
      <div className="text-center pb-2">
        <p className="text-4xl font-bold tabular-nums text-primary">
          {memberCount.toLocaleString()}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {t('memberCount', { count: memberCount.toLocaleString() })}
        </p>
      </div>

      <AddMembersSection cohortId={cohortId} />

      <Separator />

      <RemoveMembersSection cohortId={cohortId} />
    </div>
  );
}

function AddMembersSection({ cohortId }: { cohortId: string }) {
  const { t } = useLocalTranslation(translations);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading } = usePersonSearch(search, page);
  const addMutation = useAddCohortMembers(cohortId, { success: t('membersAdded'), error: t('addFailed') });

  const persons = data?.persons ?? [];
  const total = data?.total ?? 0;

  const rows = useMemo(() => toPersonRows(persons), [persons]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => toggleInSet(prev, id));
  }, []);

  const handleAdd = useCallback(async () => {
    if (selected.size === 0) return;
    await addMutation.mutateAsync([...selected]);
    setSelected(new Set());
  }, [selected, addMutation]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(0);
  }, []);

  const columns = useMemo((): Column<PersonRow>[] => [
    {
      key: 'select',
      header: '',
      className: 'w-10',
      render: (row) => (
        <input
          type="checkbox"
          checked={selected.has(row.id)}
          onChange={() => toggleSelect(row.id)}
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
  ], [selected, toggleSelect, t]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <UserPlus className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{t('addMembersTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('addMembersDescription')}</p>
        </div>
      </div>

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
          {selected.size > 0 && (
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={addMutation.isPending}
              >
                <UserPlus className="h-4 w-4" />
                {t('addSelected')} ({selected.size})
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RemoveMembersSection({ cohortId }: { cohortId: string }) {
  const { t } = useLocalTranslation(translations);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading } = usePersonSearch(search, page);
  const removeMutation = useRemoveCohortMembers(cohortId, { success: t('membersRemoved'), error: t('removeFailed') });
  const confirm = useConfirmDelete();

  const persons = data?.persons ?? [];
  const total = data?.total ?? 0;

  const rows = useMemo(() => toPersonRows(persons), [persons]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => toggleInSet(prev, id));
  }, []);

  const handleRemoveSelected = useCallback(() => {
    confirm.requestDelete('bulk', String(selected.size));
  }, [selected.size, confirm]);

  const handleRemoveOne = useCallback((id: string, name: string) => {
    confirm.requestDelete(id, name);
  }, [confirm]);

  const handleConfirmRemove = useCallback(async () => {
    if (confirm.itemId === 'bulk') {
      await removeMutation.mutateAsync([...selected]);
      setSelected(new Set());
    } else {
      await removeMutation.mutateAsync([confirm.itemId]);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(confirm.itemId);
        return next;
      });
    }
  }, [confirm.itemId, selected, removeMutation]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(0);
  }, []);

  const columns = useMemo((): Column<PersonRow>[] => [
    {
      key: 'select',
      header: '',
      className: 'w-10',
      render: (row) => (
        <input
          type="checkbox"
          checked={selected.has(row.id)}
          onChange={() => toggleSelect(row.id)}
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
    {
      key: 'actions',
      header: '',
      className: 'w-10',
      render: (row) => (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e) => {
            e.stopPropagation();
            handleRemoveOne(row.id, row.displayId);
          }}
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </Button>
      ),
    },
  ], [selected, toggleSelect, handleRemoveOne, t]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <UserMinus className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{t('removeMembersTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('removeMembersDescription')}</p>
        </div>
      </div>

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
          {selected.size > 0 && (
            <div className="flex justify-end">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRemoveSelected}
                disabled={removeMutation.isPending}
              >
                <UserMinus className="h-4 w-4" />
                {t('removeSelected')} ({selected.size})
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirm.isOpen}
        onOpenChange={(open) => { if (!open) confirm.close(); }}
        title={t('confirmRemoveTitle')}
        description={t('confirmRemoveDescription')}
        confirmLabel={t('confirmLabel')}
        cancelLabel={t('cancelLabel')}
        variant="destructive"
        onConfirm={handleConfirmRemove}
      />
    </div>
  );
}
