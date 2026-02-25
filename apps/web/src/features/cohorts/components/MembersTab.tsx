import { useCallback } from 'react';
import { UserPlus, UserMinus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useAddCohortMembers, useRemoveCohortMembers } from '../hooks/use-cohort-members';
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

      <AddMembersSection cohortId={cohortId} />

      <Separator />

      <RemoveMembersSection cohortId={cohortId} />
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
