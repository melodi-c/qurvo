import { useMemo } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';
import { PillToggleGroup } from '@/components/ui/pill-toggle-group';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { PropertyNameCombobox } from '@/components/PropertyNameCombobox';
import { CohortSelector } from '@/features/cohorts/components/CohortSelector';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { cn } from '@/lib/utils';
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
  tooltip?: string;
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
  tooltip,
}: BreakdownSectionProps) {
  const { t } = useLocalTranslation(translations);

  const typeOptions = useMemo(() => [
    { label: t('property'), value: 'property' as const },
    { label: t('cohort'), value: 'cohort' as const },
  ], [t]);

  const geoDevicePresets = useMemo(() => [
    { key: 'country', label: t('presetCountry') },
    { key: 'region', label: t('presetRegion') },
    { key: 'city', label: t('presetCity') },
    { key: 'browser', label: t('presetBrowser') },
    { key: 'os', label: t('presetOs') },
    { key: 'device_type', label: t('presetDeviceType') },
  ], [t]);

  const resolvedTooltip = tooltip ?? t('defaultTooltip');

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1">
        <SectionHeader icon={SlidersHorizontal} label={t('breakdown')} />
        <InfoTooltip content={resolvedTooltip} />
      </div>

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
              placeholder={t('propertyPlaceholder')}
              className="h-8 text-sm"
            />
          )}

          {/* Device & Geo presets */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground">{t('presetGroupLabel')}</span>
            <div className="flex flex-wrap gap-1">
              {geoDevicePresets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => onChange(value === preset.key ? '' : preset.key)}
                  className={cn(
                    'h-6 rounded px-2 text-[11px] font-medium transition-colors',
                    value === preset.key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80',
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

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
