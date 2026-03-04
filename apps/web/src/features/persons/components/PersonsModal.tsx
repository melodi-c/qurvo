import { useState, useMemo, useCallback } from 'react';
import { Users, AlertTriangle } from 'lucide-react';
import { type UseQueryResult } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { getPersonFields } from '@/lib/person';
import { useSaveAsCohort } from '../hooks/use-save-as-cohort';
import { PAGE_SIZE } from '../hooks/use-persons-at-point';
import type { Person, PersonsAtPointResponse } from '@/api/generated/Api';
import translations from './PersonsModal.translations';

interface PersonRow {
  id: string;
  displayId: string;
  name: string;
  email: string;
}

function toPersonRows(persons: Person[]): PersonRow[] {
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

export interface PersonsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Pass the result of any usePersonsAt* hook */
  query: UseQueryResult<PersonsAtPointResponse, Error>;
  page: number;
  onPageChange: (page: number) => void;
}

export function PersonsModal({
  open,
  onOpenChange,
  title,
  query,
  page,
  onPageChange,
}: PersonsModalProps) {
  const { t } = useLocalTranslation(translations);
  const { go } = useAppNavigate();

  const [showSaveForm, setShowSaveForm] = useState(false);
  const [cohortName, setCohortName] = useState('');

  const { data, isLoading, isError } = query;

  const persons = useMemo(() => data?.persons ?? [], [data?.persons]);
  const total = data?.total ?? 0;
  const rows = useMemo(() => toPersonRows(persons), [persons]);

  const allPersonIds = useMemo(() => persons.map((p) => p.id), [persons]);

  const saveMutation = useSaveAsCohort({
    successMessage: t('saved'),
    errorMessage: t('saveFailed'),
  });

  const handleRowClick = useCallback(
    (row: PersonRow) => {
      onOpenChange(false);
      void go.persons.detail(row.id);
    },
    [go, onOpenChange],
  );

  const handleSave = useCallback(() => {
    if (!cohortName.trim()) {return;}
    saveMutation.mutate(
      { name: cohortName.trim(), personIds: allPersonIds },
      {
        onSuccess: () => {
          setShowSaveForm(false);
          setCohortName('');
        },
      },
    );
  }, [cohortName, allPersonIds, saveMutation]);

  const handleCancel = useCallback(() => {
    setShowSaveForm(false);
    setCohortName('');
  }, []);

  const columns: Column<PersonRow>[] = useMemo(
    () => [
      {
        key: 'identifier',
        header: t('identifier'),
        className:
          'font-mono text-xs text-muted-foreground truncate max-w-[160px]',
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
    ],
    [t],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-0">
          {isLoading && <ListSkeleton count={5} height="h-10" />}

          {!isLoading && isError && (
            <EmptyState
              icon={AlertTriangle}
              description={t('noPersons')}
            />
          )}

          {!isLoading && !isError && rows.length === 0 && (
            <EmptyState icon={Users} description={t('noPersons')} />
          )}

          {!isLoading && !isError && rows.length > 0 && (
            <DataTable
              columns={columns}
              data={rows}
              rowKey={(row) => row.id}
              onRowClick={handleRowClick}
              page={page}
              onPageChange={onPageChange}
              hasMore={page * PAGE_SIZE + persons.length < total}
            />
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {!showSaveForm && rows.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setShowSaveForm(true)}
            >
              {t('saveAsCohort')}
            </Button>
          )}

          {showSaveForm && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSave();
              }}
              className="flex w-full gap-2 items-center"
            >
              <Input
                value={cohortName}
                onChange={(e) => setCohortName(e.target.value)}
                placeholder={t('cohortName')}
                autoFocus
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={saveMutation.isPending || !cohortName.trim()}
              >
                {saveMutation.isPending ? t('saving') : t('saveAsCohort')}
              </Button>
              <Button type="button" variant="ghost" onClick={handleCancel}>
                {t('cancel')}
              </Button>
              {total > persons.length && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {t('saveLimitWarning', { count: persons.length })}
                </span>
              )}
            </form>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
