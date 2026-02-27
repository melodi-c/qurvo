import { useCallback, useMemo, useRef, useState } from 'react';
import { UserPlus, UserMinus, Trash2, Upload, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useAddCohortMembers, useRemoveCohortMembers, useStaticCohortMembers, MEMBERS_LIMIT } from '../hooks/use-cohort-members';
import { useUploadCohortCsv } from '../hooks/use-cohorts';
import { extractApiErrorMessage } from '@/lib/utils';
import { getPersonFields } from '@/lib/person';
import { PersonSearchTable, type PersonRow } from './PersonSearchTable';
import translations from './MembersTab.translations';

interface MembersTabProps {
  cohortId: string;
  memberCount: number;
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

      <CurrentMembersSection cohortId={cohortId} />

      <Separator />

      <CsvUploadSection cohortId={cohortId} />

      <Separator />

      <AddMembersSection cohortId={cohortId} />

      <Separator />

      <RemoveMembersSection cohortId={cohortId} />
    </div>
  );
}

interface MemberDisplayRow {
  id: string;
  displayId: string;
  name: string;
  email: string;
}

function CurrentMembersSection({ cohortId }: { cohortId: string }) {
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

function CsvUploadSection({ cohortId }: { cohortId: string }) {
  const { t } = useLocalTranslation(translations);
  const uploadMutation = useUploadCohortCsv();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error(t('uploadCsvInvalidFormat'));
      e.target.value = '';
      return;
    }

    const csvContent = await file.text();
    e.target.value = '';

    try {
      await uploadMutation.mutateAsync({ cohortId, csvContent });
      toast.success(t('uploadCsvSuccess'));
    } catch (err) {
      toast.error(extractApiErrorMessage(err, t('uploadCsvFailed')));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Upload className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{t('uploadCsvTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('uploadCsvDescription')}</p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileChange}
      />

      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadMutation.isPending}
      >
        <Upload className="h-4 w-4 mr-2" />
        {t('uploadCsvButton')}
      </Button>
    </div>
  );
}

function AddMembersSection({ cohortId }: { cohortId: string }) {
  const { t } = useLocalTranslation(translations);
  const addMutation = useAddCohortMembers(cohortId, { success: t('membersAdded'), error: t('addFailed') });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <UserPlus className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{t('addMembersTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('addMembersDescription')}</p>
        </div>
      </div>

      <PersonSearchTable
        renderFooter={(selected, clearSelection) =>
          selected.size > 0 && (
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={async () => {
                  await addMutation.mutateAsync([...selected]);
                  clearSelection();
                }}
                disabled={addMutation.isPending}
              >
                <UserPlus className="h-4 w-4" />
                {t('addSelected')} ({selected.size})
              </Button>
            </div>
          )
        }
      />
    </div>
  );
}

function RemoveMembersSection({ cohortId }: { cohortId: string }) {
  const { t } = useLocalTranslation(translations);
  const removeMutation = useRemoveCohortMembers(cohortId, { success: t('membersRemoved'), error: t('removeFailed') });
  const confirm = useConfirmDelete();

  const handleRemoveOne = useCallback((row: PersonRow) => (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={(e) => {
        e.stopPropagation();
        confirm.requestDelete(row.id, row.displayId);
      }}
    >
      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
    </Button>
  ), [confirm]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <UserMinus className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{t('removeMembersTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('removeMembersDescription')}</p>
        </div>
      </div>

      <PersonSearchTable
        renderRowAction={handleRemoveOne}
        renderFooter={(selected, clearSelection) => (
          <>
            {selected.size > 0 && (
              <div className="flex justify-end">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => confirm.requestDelete('bulk', String(selected.size))}
                  disabled={removeMutation.isPending}
                >
                  <UserMinus className="h-4 w-4" />
                  {t('removeSelected')} ({selected.size})
                </Button>
              </div>
            )}

            <ConfirmDialog
              open={confirm.isOpen}
              onOpenChange={(open) => { if (!open) confirm.close(); }}
              title={t('confirmRemoveTitle')}
              description={t('confirmRemoveDescription')}
              confirmLabel={t('confirmLabel')}
              cancelLabel={t('cancelLabel')}
              variant="destructive"
              onConfirm={async () => {
                if (confirm.itemId === 'bulk') {
                  await removeMutation.mutateAsync([...selected]);
                  clearSelection();
                } else {
                  await removeMutation.mutateAsync([confirm.itemId]);
                }
              }}
            />
          </>
        )}
      />
    </div>
  );
}
