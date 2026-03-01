import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useAddCohortMembers } from '../hooks/use-cohort-members';
import { PersonSearchTable } from './PersonSearchTable';
import translations from './AddMembersSection.translations';

interface AddMembersSectionProps {
  cohortId: string;
}

export function AddMembersSection({ cohortId }: AddMembersSectionProps) {
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
