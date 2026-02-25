import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { api } from '@/api/client';
import { CreditCard, Check, X } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { STATUS_COLORS } from '@/lib/chart-colors';
import translations from './billing-tab.translations';

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

  if (isLoading) return <ListSkeleton count={1} height="h-40" />;

  const pct = data?.events_limit
    ? Math.min(100, Math.round((data.events_this_month / data.events_limit) * 100))
    : null;

  const periodStart = data ? new Date(data.period_start).toLocaleDateString() : '';
  const periodEnd = data ? new Date(data.period_end).toLocaleDateString() : '';

  const features = data?.features as Record<string, boolean> | undefined;
  const featureLabels: Record<string, string> = {
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
          <dl className="divide-y divide-border text-sm">
            <div className="flex items-center justify-between px-6 py-3">
              <dt className="text-muted-foreground">{t('eventsThisMonth')}</dt>
              <dd className="font-mono">{formatNumber(data?.events_this_month ?? 0)}</dd>
            </div>
            <div className="flex items-center justify-between px-6 py-3">
              <dt className="text-muted-foreground">{t('monthlyLimit')}</dt>
              <dd className="font-mono">
                {data?.events_limit ? formatNumber(data.events_limit) : t('unlimited')}
              </dd>
            </div>
            {pct !== null && (
              <div className="px-6 py-3 space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{t('usage')}</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}
            {data?.data_retention_days != null && (
              <div className="flex items-center justify-between px-6 py-3">
                <dt className="text-muted-foreground">{t('dataRetention')}</dt>
                <dd>{t('dataRetentionDays', { days: data.data_retention_days })}</dd>
              </div>
            )}
            {data?.max_projects != null && (
              <div className="flex items-center justify-between px-6 py-3">
                <dt className="text-muted-foreground">{t('maxProjects')}</dt>
                <dd>{data.max_projects}</dd>
              </div>
            )}
            <div className="flex items-center justify-between px-6 py-3">
              <dt className="text-muted-foreground">{t('aiMessagesLimit')}</dt>
              <dd className="font-mono">
                {(data?.ai_messages_per_month ?? null) !== null && (data?.ai_messages_per_month ?? -1) >= 0
                  ? formatNumber(data!.ai_messages_per_month!)
                  : t('aiMessagesUnlimited')}
              </dd>
            </div>
            {(data?.ai_messages_per_month ?? null) !== null && (data?.ai_messages_per_month ?? -1) >= 0 && (
              <div className="flex items-center justify-between px-6 py-3">
                <dt className="text-muted-foreground">{t('aiMessagesUsed')}</dt>
                <dd className="font-mono">{formatNumber(data?.ai_messages_used ?? 0)}</dd>
              </div>
            )}
            <div className="flex items-center justify-between px-6 py-3">
              <dt className="text-muted-foreground">{t('billingPeriod')}</dt>
              <dd className="text-xs text-muted-foreground">{periodStart} – {periodEnd}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {features && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('features')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <dl className="divide-y divide-border text-sm">
              {Object.entries(featureLabels).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between px-6 py-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>
                    {features[key] ? (
                      <Check className={`h-4 w-4 ${STATUS_COLORS.success}`} />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground" />
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
