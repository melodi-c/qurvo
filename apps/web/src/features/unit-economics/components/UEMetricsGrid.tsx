import { cn } from '@/lib/utils';
import type { UnitEconomicsMetrics } from '@/api/generated/Api';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { UEMetricCard } from './UEMetricCard';
import translations from './UEMetricsGrid.translations';

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
  const { t } = useLocalTranslation(translations);
  const m = metrics;
  const roiAccent = m.roi_percent > 0 ? 'positive' as const : m.roi_percent < 0 ? 'negative' as const : undefined;
  const cmAccent = m.cm > 0 ? 'positive' as const : m.cm < 0 ? 'negative' as const : undefined;

  return (
    <div className="space-y-3">
      {/* Row 1: Acquisition & Conversion */}
      <div className="grid grid-cols-4 gap-3">
        <UEMetricCard label="UA" value={fmt(m.ua)} formula={t('formulaUA')} />
        <UEMetricCard label="C1" value={pct(m.c1)} formula={t('formulaC1')} />
        <UEMetricCard label="C2" value={pct(m.c2)} formula={t('formulaC2')} />
        <UEMetricCard label="APC" value={fmt(m.apc)} formula={t('formulaAPC')} />
      </div>

      {/* Row 2: Revenue */}
      <div className="grid grid-cols-4 gap-3">
        <UEMetricCard label="AVP" value={money(m.avp, currency)} formula={t('formulaAVP')} />
        <UEMetricCard label="ARPPU" value={money(m.arppu, currency)} formula={t('formulaARPPU')} />
        <UEMetricCard label="ARPU" value={money(m.arpu, currency)} formula={t('formulaARPU')} />
        <UEMetricCard label="Churn" value={pct(m.churn_rate)} formula={t('formulaChurn')} />
      </div>

      {/* Row 3: Unit Economics */}
      <div className="grid grid-cols-4 gap-3">
        <UEMetricCard label="Lifetime" value={fmt(m.lifetime_periods) + ' ' + t('periodSuffix')} formula={t('formulaLifetime')} />
        <UEMetricCard label="LTV" value={money(m.ltv, currency)} formula={t('formulaLTV')} />
        <UEMetricCard label="CAC" value={money(m.cac, currency)} formula={t('formulaCAC')} />
        <UEMetricCard label="ROI" value={(m.roi_percent > 0 ? '+' : '') + fmt(m.roi_percent) + '%'} accent={roiAccent} formula={t('formulaROI')} />
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

