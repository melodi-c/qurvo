import { cn } from '@/lib/utils';
import type { UnitEconomicsMetrics } from '@/api/generated/Api';
import { UEMetricCard } from './UEMetricCard';

interface UEMetricsGridProps {
  metrics: UnitEconomicsMetrics;
  currency?: string;
}

function fmt(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

function money(n: number, currency: string): string {
  const symbols: Record<string, string> = { USD: '$', EUR: '\u20AC', RUB: '\u20BD' };
  const sym = symbols[currency] ?? currency + ' ';
  return sym + fmt(n);
}

export function UEMetricsGrid({ metrics, currency = 'USD' }: UEMetricsGridProps) {
  const m = metrics;
  const roiAccent = m.roi_percent > 0 ? 'positive' as const : m.roi_percent < 0 ? 'negative' as const : undefined;
  const cmAccent = m.cm > 0 ? 'positive' as const : m.cm < 0 ? 'negative' as const : undefined;

  return (
    <div className="space-y-3">
      {/* Row 1: Acquisition & Conversion */}
      <div className="grid grid-cols-4 gap-3">
        <UEMetricCard label="UA" value={fmt(m.ua)} formula="New unique users in period" />
        <UEMetricCard label="C1" value={pct(m.c1)} formula="C1 = paying_users / total_users" />
        <UEMetricCard label="C2" value={pct(m.c2)} formula="C2 = repeat_users / paying_users" />
        <UEMetricCard label="APC" value={fmt(m.apc)} formula="APC = 1 / (1 - C2)" />
      </div>

      {/* Row 2: Revenue */}
      <div className="grid grid-cols-4 gap-3">
        <UEMetricCard label="AVP" value={money(m.avp, currency)} formula="AVP = revenue / purchases" />
        <UEMetricCard label="ARPPU" value={money(m.arppu, currency)} formula="ARPPU = AVP × APC" />
        <UEMetricCard label="ARPU" value={money(m.arpu, currency)} formula="ARPU = ARPPU × C1" />
        <UEMetricCard label="Churn" value={pct(m.churn_rate)} formula="Churn = churned / prev_active" />
      </div>

      {/* Row 3: Unit Economics */}
      <div className="grid grid-cols-4 gap-3">
        <UEMetricCard label="Lifetime" value={fmt(m.lifetime_periods) + ' per.'} formula="Lifetime = 1 / Churn" />
        <UEMetricCard label="LTV" value={money(m.ltv, currency)} formula="LTV = ARPU × Lifetime" />
        <UEMetricCard label="CAC" value={money(m.cac, currency)} formula="CAC = ad_spend / UA" />
        <UEMetricCard label="ROI" value={(m.roi_percent > 0 ? '+' : '') + fmt(m.roi_percent) + '%'} accent={roiAccent} formula="ROI = (LTV - CAC) / CAC × 100%" />
      </div>

      {/* CM Bar */}
      <div className={cn(
        'rounded-lg border border-border p-3 flex items-center justify-between',
        cmAccent === 'positive' ? 'bg-emerald-950/20' : cmAccent === 'negative' ? 'bg-red-950/20' : 'bg-card',
      )}>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">LTV {money(m.ltv, currency)}</span>
          <span className="text-muted-foreground">-</span>
          <span className="text-muted-foreground">CAC {money(m.cac, currency)}</span>
        </div>
        <div className={cn(
          'text-lg font-bold tabular-nums',
          cmAccent === 'positive' && 'text-emerald-400',
          cmAccent === 'negative' && 'text-red-400',
        )}>
          CM: {(m.cm > 0 ? '+' : '') + money(m.cm, currency)}
        </div>
      </div>
    </div>
  );
}

