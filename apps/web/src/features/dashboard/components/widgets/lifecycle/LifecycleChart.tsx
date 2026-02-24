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
import { LIFECYCLE_STATUS_COLORS } from './lifecycle-shared';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './LifecycleChart.translations';

interface LifecycleChartProps {
  result: LifecycleResult;
  compact?: boolean;
}

export function LifecycleChart({ result, compact = false }: LifecycleChartProps) {
  const { t } = useLocalTranslation(translations);

  const data = useMemo(
    () =>
      result.data.map((d) => ({
        bucket: d.bucket.slice(0, 10),
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
              tick={{ fill: CHART_AXIS_TICK_COLOR, fontSize: compact ? 10 : 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: CHART_AXIS_TICK_COLOR, fontSize: compact ? 10 : 12 }}
              axisLine={false}
              tickLine={false}
              width={compact ? 35 : 45}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
            {!compact && (
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
              />
            )}
            <Bar dataKey="new" stackId="a" fill={LIFECYCLE_STATUS_COLORS.new} name={t('new')} />
            <Bar dataKey="returning" stackId="a" fill={LIFECYCLE_STATUS_COLORS.returning} name={t('returning')} />
            <Bar dataKey="resurrecting" stackId="a" fill={LIFECYCLE_STATUS_COLORS.resurrecting} name={t('resurrecting')} />
            <Bar dataKey="dormant" stackId="a" fill={LIFECYCLE_STATUS_COLORS.dormant} name={t('dormant')} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {compact && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-1.5 px-1">
          {statuses.map((s) => (
            <div key={s.key} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-[10px] text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
