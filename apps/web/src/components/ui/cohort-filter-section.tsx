import { UsersRound } from 'lucide-react';
import { SectionHeader } from '@/components/ui/section-header';
import { CohortSelector } from '@/features/cohorts/components/CohortSelector';

interface CohortFilterSectionProps {
  value: string[];
  onChange: (cohortIds: string[]) => void;
}

export function CohortFilterSection({ value, onChange }: CohortFilterSectionProps) {
  return (
    <section className="space-y-3">
      <SectionHeader icon={UsersRound} label="Cohort filter" />
      <CohortSelector
        value={value}
        onChange={onChange}
      />
      <p className="text-xs text-muted-foreground">
        Filter results to users in selected cohorts
      </p>
    </section>
  );
}
