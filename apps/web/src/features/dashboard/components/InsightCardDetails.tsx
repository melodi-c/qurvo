import { CalendarDays, Filter, Layers, Users, AlertCircle } from 'lucide-react';
import type { DashboardFilterOverrides } from '../lib/filter-overrides';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './InsightCardDetails.translations';
import type { Insight } from '@/api/generated/Api';

interface InsightCardDetailsProps {
  config: Insight['config'];
  filterOverrides: DashboardFilterOverrides;
}

export function InsightCardDetails({ config, filterOverrides }: InsightCardDetailsProps) {
  const { t } = useLocalTranslation(translations);
  const hasDateOverride = !!(filterOverrides.dateFrom || filterOverrides.dateTo);
  const hasPropertyOverride = filterOverrides.propertyFilters.length > 0;
  const dateFrom = 'date_from' in config ? config.date_from : undefined;
  const dateTo = 'date_to' in config ? config.date_to : undefined;
  const breakdown = 'breakdown_property' in config ? config.breakdown_property : undefined;
  const cohortIds = 'cohort_ids' in config ? config.cohort_ids : undefined;

  return (
    <div className="px-3 py-2 border-b border-border/50 bg-muted/20 space-y-1.5 text-xs text-muted-foreground">
      {/* Date range */}
      {(dateFrom || dateTo) && (
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-3 w-3 flex-shrink-0" />
          <span>{dateFrom} {t('to')} {dateTo}</span>
          {hasDateOverride && (
            <span className="ml-auto flex items-center gap-1 text-amber-400">
              <AlertCircle className="h-3 w-3" />
              {t('overrideActive')}
            </span>
          )}
        </div>
      )}

      {/* Property filter override indicator */}
      {hasPropertyOverride && (
        <div className="flex items-center gap-1.5">
          <Filter className="h-3 w-3 flex-shrink-0" />
          <span>
            {filterOverrides.propertyFilters
              .map((f) => `${f.property} ${f.operator} ${f.value ?? ''}`.trim())
              .join(', ')}
          </span>
          <span className="ml-auto flex items-center gap-1 text-amber-400">
            <AlertCircle className="h-3 w-3" />
            {t('overrideActive')}
          </span>
        </div>
      )}

      {/* Breakdown */}
      {breakdown && (
        <div className="flex items-center gap-1.5">
          <Layers className="h-3 w-3 flex-shrink-0" />
          <span>{t('breakdown')}: {breakdown}</span>
        </div>
      )}

      {/* Cohorts */}
      {cohortIds && cohortIds.length > 0 && (
        <div className="flex items-center gap-1.5">
          <Users className="h-3 w-3 flex-shrink-0" />
          <span>{t('cohorts')}: {cohortIds.length}</span>
        </div>
      )}
    </div>
  );
}
