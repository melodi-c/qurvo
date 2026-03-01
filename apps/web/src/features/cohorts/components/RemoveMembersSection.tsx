import { useCallback } from 'react';
import { UserMinus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useRemoveCohortMembers } from '../hooks/use-cohort-members';
import { PersonSearchTable, type PersonRow } from './PersonSearchTable';
import translations from './RemoveMembersSection.translations';

interface RemoveMembersSectionProps {
  cohortId: string;
}

export function RemoveMembersSection({ cohortId }: RemoveMembersSectionProps) {
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
              onOpenChange={(open) => { if (!open) {confirm.close();} }}
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
