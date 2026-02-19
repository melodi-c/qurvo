import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import type { FunnelStepResult } from '@/features/dashboard/types';

interface FunnelChartProps {
  steps: FunnelStepResult[];
}

interface ChartDatum {
  name: string;
  count: number;
  total: number;
  pct: string;
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDatum }> }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-sm shadow-lg">
      <p className="font-medium mb-1 text-foreground">{d.name}</p>
      <p className="text-muted-foreground">{d.count.toLocaleString()} users</p>
      <p className="text-chart-2 font-medium">{d.pct} of total</p>
    </div>
  );
};

// Each step row = 2 stacked bars (24px each) + gap
const ROW_PX = 64;

export function FunnelChart({ steps }: FunnelChartProps) {
  if (steps.length === 0) return null;

  const total = steps[0].count;
  const chartHeight = steps.length * ROW_PX + 16;

  const chartData: ChartDatum[] = steps.map((step) => ({
    name: step.label || step.event_name,
    count: step.count,
    total,
    pct: `${step.conversion_rate}%`,
  }));

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 72, left: 8, bottom: 4 }}
        barSize={22}
        barCategoryGap="20%"
      >
        <XAxis type="number" domain={[0, total]} hide />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tick={{ fill: '#a1a1aa', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={false} />

        {/* Background: full width gray track */}
        <Bar dataKey="total" fill="#27272a" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {chartData.map((_, i) => (
            <Cell key={i} fill="#27272a" />
          ))}
        </Bar>

        {/* Foreground: actual count */}
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {chartData.map((_, i) => (
            <Cell
              key={i}
              fill={i === 0 ? 'var(--color-chart-2)' : 'var(--color-chart-1)'}
            />
          ))}
          <LabelList
            dataKey="pct"
            position="right"
            style={{ fill: '#a1a1aa', fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
