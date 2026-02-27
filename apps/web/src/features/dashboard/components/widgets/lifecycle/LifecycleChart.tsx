import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { LifecycleResult } from '@/api/generated/Api';
import { CHART_TOOLTIP_STYLE, CHART_AXIS_TICK_COLOR, CHART_GRID_COLOR } from '@/lib/chart-colors';
import { formatBucket, formatCompactNumber } from '@/lib/formatting';
import { LIFECYCLE_STATUS_COLORS } from './lifecycle-shared';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useProjectStore } from '@/stores/project';
import translations from './LifecycleChart.translations';

interface LifecycleChartProps {
  result: LifecycleResult;
  compact?: boolean;
}

export function LifecycleChart({ result, compact = false }: LifecycleChartProps) {
  const { t } = useLocalTranslation(translations);
  const timezone = useProjectStore((s) => s.projectTimezone);

  const data = useMemo(
    () =>
      result.data.map((d) => ({
        bucket: d.bucket,
        new: d.new,
        returning: d.returning,
        resurrecting: d.resurrecting,
        dormant: d.dormant,
      })),
    [result.data],
  );

  if (data.length === 0) return null;

  const height = compact ? 160 : 300;

  const statuses = [
    { key: 'new', color: LIFECYCLE_STATUS_COLORS.new, label: t('new') },
    { key: 'returning', color: LIFECYCLE_STATUS_COLORS.returning, label: t('returning') },
    { key: 'resurrecting', color: LIFECYCLE_STATUS_COLORS.resurrecting, label: t('resurrecting') },
    { key: 'dormant', color: LIFECYCLE_STATUS_COLORS.dormant, label: t('dormant') },
  ];

  return (
    <div className={compact ? 'h-full flex flex-col' : ''}>
      <div className={compact ? 'flex-1 min-h-0' : ''}>
        <ResponsiveContainer width="100%" height={compact ? '100%' : height}>
          <BarChart
            data={data}
            stackOffset="sign"
            margin={compact ? { top: 5, right: 10, bottom: 5, left: 0 } : { top: 10, right: 30, bottom: 10, left: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} opacity={0.5} />
            <XAxis
              dataKey="bucket"
              tickFormatter={(v) => formatBucket(v, result.granularity, compact, timezone)}
              tick={{ fill: CHART_AXIS_TICK_COLOR, fontSize: compact ? 10 : 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: CHART_AXIS_TICK_COLOR, fontSize: compact ? 10 : 12 }}
              axisLine={false}
              tickLine={false}
              width={compact ? 40 : 45}
              tickFormatter={compact ? formatCompactNumber : undefined}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={(v) => formatBucket(v as string, result.granularity, false, timezone)}
            />
            <Bar dataKey="new" stackId="a" fill={LIFECYCLE_STATUS_COLORS.new} name={t('new')} />
            <Bar dataKey="returning" stackId="a" fill={LIFECYCLE_STATUS_COLORS.returning} name={t('returning')} />
            <Bar dataKey="resurrecting" stackId="a" fill={LIFECYCLE_STATUS_COLORS.resurrecting} name={t('resurrecting')} />
            <Bar dataKey="dormant" stackId="a" fill={LIFECYCLE_STATUS_COLORS.dormant} name={t('dormant')} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className={compact ? 'flex flex-wrap gap-x-3 gap-y-0.5 pt-1.5 px-1' : 'flex flex-wrap gap-x-4 gap-y-1 pt-3 px-2'}>
        {statuses.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span
              className={compact ? 'inline-block h-2 w-2 rounded-full shrink-0' : 'inline-block h-3 w-3 rounded-full shrink-0'}
              style={{ backgroundColor: s.color }}
            />
            <span className={compact ? 'text-[10px] text-muted-foreground' : 'text-xs text-muted-foreground'}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
