import { CalendarDays, Layers, Users, AlertCircle } from 'lucide-react';
import { hasActiveOverrides, type DashboardFilterOverrides } from '../lib/filter-overrides';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './InsightCardDetails.translations';

interface InsightCardDetailsProps {
  config: Record<string, any>;
  filterOverrides: DashboardFilterOverrides;
}

export function InsightCardDetails({ config, filterOverrides }: InsightCardDetailsProps) {
  const { t } = useLocalTranslation(translations);
  const hasOverrides = hasActiveOverrides(filterOverrides);

  const dateFrom = config.date_from;
  const dateTo = config.date_to;
  const breakdown = config.breakdown_property;
  const cohortIds = config.cohort_ids as string[] | undefined;

  return (
    <div className="px-3 py-2 border-b border-border/50 bg-muted/20 space-y-1.5 text-xs text-muted-foreground">
      {/* Date range */}
      {(dateFrom || dateTo) && (
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-3 w-3 flex-shrink-0" />
          <span>{dateFrom} {t('to')} {dateTo}</span>
          {hasOverrides && (
            <span className="ml-auto flex items-center gap-1 text-amber-400">
              <AlertCircle className="h-3 w-3" />
              {t('overrideActive')}
            </span>
          )}
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
