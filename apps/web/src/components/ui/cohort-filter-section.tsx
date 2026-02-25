import { UsersRound } from 'lucide-react';
import { SectionHeader } from '@/components/ui/section-header';
import { CohortSelector } from '@/features/cohorts/components/CohortSelector';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './cohort-filter-section.translations';

interface CohortFilterSectionProps {
  value: string[];
  onChange: (cohortIds: string[]) => void;
}

export function CohortFilterSection({ value, onChange }: CohortFilterSectionProps) {
  const { t } = useLocalTranslation(translations);

  return (
    <section className="space-y-3">
      <SectionHeader icon={UsersRound} label={t('cohortFilter')} />
      <CohortSelector
        value={value}
        onChange={onChange}
      />
      <p className="text-xs text-muted-foreground">
        {t('description')}
      </p>
    </section>
  );
}
