import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { DefinitionList, DefinitionListRow } from '@/components/ui/definition-list';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { api } from '@/api/client';
import { CreditCard, Check, X } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { STATUS_COLORS } from '@/lib/chart-colors';
import translations from './billing-tab.translations';
import { formatDate } from '@/lib/formatting';

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n);
}

export function BillingTab({ projectId }: { projectId: string }) {
  const { t } = useLocalTranslation(translations);

  const { data, isLoading } = useQuery({
    queryKey: ['billing', projectId],
    queryFn: () => api.billingControllerGetStatus({ projectId }),
    enabled: !!projectId,
    refetchInterval: 60_000,
  });

  if (!projectId) {
    return <EmptyState icon={CreditCard} description={t('selectProject')} />;
  }

  if (isLoading) {return <ListSkeleton count={1} height="h-40" />;}

  const pct = data?.events_limit
    ? Math.min(100, Math.round((data.events_this_month / data.events_limit) * 100))
    : null;

  const periodStart = data ? formatDate(data.period_start) : '';
  const periodEnd = data ? formatDate(data.period_end) : '';

  const features = data?.features;
  const featureLabels: Record<keyof NonNullable<typeof features>, string> = {
    cohorts: t('cohorts'),
    lifecycle: t('lifecycle'),
    stickiness: t('stickiness'),
    api_export: t('apiExport'),
    ai_insights: t('aiInsights'),
  };

  return (
    <div className="space-y-6 max-w-lg">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{t('plan')}</CardTitle>
            <Badge variant="secondary" className="capitalize">
              {data?.plan_name ?? data?.plan}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DefinitionList>
            <DefinitionListRow label={t('eventsThisMonth')}>
              <span className="font-mono">{formatNumber(data?.events_this_month ?? 0)}</span>
            </DefinitionListRow>
            <DefinitionListRow label={t('monthlyLimit')}>
              <span className="font-mono">
                {data?.events_limit ? formatNumber(data.events_limit) : t('unlimited')}
              </span>
            </DefinitionListRow>
            {pct !== null && (
              <div className="px-6 py-3 space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{t('usage')}</span>
                  <span>{pct}%</span>
                </div>
                <div
                  className="h-1.5 rounded-full bg-muted overflow-hidden"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t('usageProgress')}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}
            {data?.data_retention_days != null && (
              <DefinitionListRow label={<>{t('dataRetention')}<InfoTooltip content={t('dataRetentionTooltip')} /></>}>
                {t('dataRetentionDays', { days: data.data_retention_days })}
              </DefinitionListRow>
            )}
            {data?.max_projects != null && (
              <DefinitionListRow label={t('maxProjects')}>
                {data.max_projects}
              </DefinitionListRow>
            )}
            <DefinitionListRow label={<>{t('aiMessagesLimit')}<InfoTooltip content={t('aiMessagesTooltip')} /></>}>
              <span className="font-mono">
                {(data?.ai_messages_per_month ?? null) !== null && (data?.ai_messages_per_month ?? -1) >= 0
                  ? formatNumber(data!.ai_messages_per_month!)
                  : t('aiMessagesUnlimited')}
              </span>
            </DefinitionListRow>
            {(data?.ai_messages_per_month ?? null) !== null && (data?.ai_messages_per_month ?? -1) >= 0 && (
              <DefinitionListRow label={t('aiMessagesUsed')}>
                <span className="font-mono">{formatNumber(data?.ai_messages_used ?? 0)}</span>
              </DefinitionListRow>
            )}
            <DefinitionListRow label={t('billingPeriod')}>
              <span className="text-xs text-muted-foreground">{periodStart} – {periodEnd}</span>
            </DefinitionListRow>
          </DefinitionList>
        </CardContent>
      </Card>

      {features && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('features')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DefinitionList>
              {(Object.keys(featureLabels) as (keyof typeof featureLabels)[]).map((key) => (
                <DefinitionListRow key={key} label={featureLabels[key]}>
                  {features[key] ? (
                    <Check className={`h-4 w-4 ${STATUS_COLORS.success}`} />
                  ) : (
                    <X className="h-4 w-4 text-muted-foreground" />
                  )}
                </DefinitionListRow>
              ))}
            </DefinitionList>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
