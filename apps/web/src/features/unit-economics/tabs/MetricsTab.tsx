import { useState, useMemo } from 'react';
import { DateRangeSection } from '@/components/ui/date-range-section';
import { PillToggleGroup } from '@/components/ui/pill-toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { BarChart3 } from 'lucide-react';
import { useUnitEconomics } from '../hooks/use-unit-economics';
import { useUEConfig } from '../hooks/use-ue-config';
import { useChannels } from '../hooks/use-channels';
import { UEMetricsGrid } from '../components/UEMetricsGrid';
import { UEChart } from '../components/UEChart';
import type { UnitEconomicsQueryDtoGranularityEnum } from '@/api/generated/Api';

const GRANULARITY_OPTIONS = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
];

const CHART_METRICS = [
  { label: 'ARPU', value: 'arpu' },
  { label: 'LTV', value: 'ltv' },
  { label: 'CAC', value: 'cac' },
  { label: 'C1', value: 'c1' },
  { label: 'ROI', value: 'roi_percent' },
  { label: 'UA', value: 'ua' },
];

export function MetricsTab() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [granularity, setGranularity] = useState<UnitEconomicsQueryDtoGranularityEnum>('day');
  const [channelId, setChannelId] = useState<string>('');
  const [selectedChartMetrics, setSelectedChartMetrics] = useState<string[]>(['arpu', 'ltv', 'cac']);

  const { data: config } = useUEConfig();
  const { data: channels } = useChannels();

  const queryParams = useMemo(() => {
    if (!config?.purchase_event_name) return null;
    return {
      date_from: dateFrom,
      date_to: dateTo,
      granularity,
      ...(channelId ? { channel_id: channelId } : {}),
    };
  }, [dateFrom, dateTo, granularity, channelId, config]);

  const { data: result, isLoading } = useUnitEconomics(queryParams);

  const toggleChartMetric = (metric: string) => {
    setSelectedChartMetrics((prev) =>
      prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric],
    );
  };

  if (!config?.purchase_event_name) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Configure Unit Economics"
        description="Set the purchase event name in Settings tab to start calculating metrics"
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-end gap-4 flex-wrap">
        <DateRangeSection
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
        />
        <PillToggleGroup
          options={GRANULARITY_OPTIONS}
          value={granularity}
          onChange={(v) => setGranularity(v as UnitEconomicsQueryDtoGranularityEnum)}
        />
        {channels && channels.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Channel</Label>
            <Select value={channelId} onValueChange={(v) => setChannelId(v === '__all__' ? '' : v)}>
              <SelectTrigger size="sm" className="w-[180px]">
                <SelectValue placeholder="All channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All channels</SelectItem>
                {channels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      {isLoading ? (
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-lg" />
          ))}
        </div>
      ) : result?.data ? (
        <>
          <UEMetricsGrid metrics={result.data.totals} currency={config.currency} />

          {/* Chart metric selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">Chart:</span>
            {CHART_METRICS.map((m) => (
              <button
                key={m.value}
                onClick={() => toggleChartMetric(m.value)}
                className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                  selectedChartMetrics.includes(m.value)
                    ? 'border-primary/50 bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Timeline Chart */}
          {result.data.data.length > 1 && (
            <UEChart buckets={result.data.data} selectedMetrics={selectedChartMetrics} />
          )}
        </>
      ) : null}
    </div>
  );
}
