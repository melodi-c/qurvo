import { useMemo } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';
import { PillToggleGroup } from '@/components/ui/pill-toggle-group';
import { PropertyNameCombobox } from '@/components/PropertyNameCombobox';
import { CohortSelector } from '@/features/cohorts/components/CohortSelector';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './breakdown-section.translations';

interface BreakdownSectionProps {
  value: string;
  onChange: (value: string) => void;
  propertyNames?: string[];
  propertyDescriptions?: Record<string, string>;
  breakdownType?: 'property' | 'cohort';
  onBreakdownTypeChange?: (type: 'property' | 'cohort') => void;
  breakdownCohortIds?: string[];
  onBreakdownCohortIdsChange?: (ids: string[]) => void;
}

export function BreakdownSection({
  value,
  onChange,
  propertyNames,
  propertyDescriptions,
  breakdownType = 'property',
  onBreakdownTypeChange,
  breakdownCohortIds = [],
  onBreakdownCohortIdsChange,
}: BreakdownSectionProps) {
  const { t } = useLocalTranslation(translations);

  const typeOptions = useMemo(() => [
    { label: t('property'), value: 'property' as const },
    { label: t('cohort'), value: 'cohort' as const },
  ], [t]);

  return (
    <section className="space-y-3">
      <SectionHeader icon={SlidersHorizontal} label={t('breakdown')} />

      {onBreakdownTypeChange && (
        <PillToggleGroup
          options={typeOptions}
          value={breakdownType}
          onChange={onBreakdownTypeChange}
        />
      )}

      {breakdownType === 'property' ? (
        <>
          {propertyNames !== undefined ? (
            <PropertyNameCombobox
              value={value}
              onChange={onChange}
              propertyNames={propertyNames}
              descriptions={propertyDescriptions}
              className="h-8"
            />
          ) : (
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="e.g. country, plan, properties.utm_source"
              className="h-8 text-sm"
            />
          )}
          <p className="text-xs text-muted-foreground">{t('propertyDescription')}</p>
        </>
      ) : (
        <>
          <CohortSelector
            value={breakdownCohortIds}
            onChange={onBreakdownCohortIdsChange ?? (() => {})}
          />
          <p className="text-xs text-muted-foreground">{t('cohortDescription')}</p>
        </>
      )}
    </section>
  );
}
