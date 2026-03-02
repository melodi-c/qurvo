import { CalendarDays, Layers, Users } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './InsightCardDetails.translations';
import type { Insight } from '@/api/generated/Api';

interface InsightCardDetailsProps {
  config: Insight['config'];
}

export function InsightCardDetails({ config }: InsightCardDetailsProps) {
  const { t } = useLocalTranslation(translations);
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
