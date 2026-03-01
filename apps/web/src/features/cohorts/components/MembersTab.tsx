import { Separator } from '@/components/ui/separator';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { CurrentMembersSection } from './CurrentMembersSection';
import { CsvUploadSection } from './CsvUploadSection';
import { AddMembersSection } from './AddMembersSection';
import { RemoveMembersSection } from './RemoveMembersSection';
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
