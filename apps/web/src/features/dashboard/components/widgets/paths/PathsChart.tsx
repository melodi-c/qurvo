import { useMemo } from 'react';
import { Sankey, Tooltip, Layer, Rectangle } from 'recharts';
import type { PathTransition, TopPath } from '@/api/generated/Api';
import { useElementSize } from '@/hooks/use-element-size';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { CHART_COLORS_HEX } from '@/lib/chart-colors';
import translations from './PathsChart.translations';

interface PathsChartProps {
  transitions: PathTransition[];
  topPaths: TopPath[];
  compact?: boolean;
}

interface SankeyNode {
  name: string;
  displayName: string;
}

interface SankeyLink {
  source: number;
  target: number;
  value: number;
}

const COLORS = CHART_COLORS_HEX;

function toSankeyData(transitions: PathTransition[]) {
  const nodeMap = new Map<string, number>();
  const nodes: SankeyNode[] = [];

  const getNodeIndex = (step: number, name: string) => {
    const key = `${step}:${name}`;
    if (!nodeMap.has(key)) {
      const idx = nodes.length;
      nodeMap.set(key, idx);
      nodes.push({ name: key, displayName: name });
    }
    return nodeMap.get(key)!;
  };

  const links: SankeyLink[] = [];

  for (const t of transitions) {
    const sourceIdx = getNodeIndex(t.step, t.source);
    const targetIdx = getNodeIndex(t.step + 1, t.target);
    links.push({ source: sourceIdx, target: targetIdx, value: t.person_count });
  }

  return { nodes, links };
}

interface CustomNodeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  payload: SankeyNode;
}

function CustomNode({ x = 0, y = 0, width = 0, height = 0, index = 0, payload = { name: '', displayName: '' } }: Partial<CustomNodeProps>) {
  const color = COLORS[index % COLORS.length];
  return (
    <Layer key={`node-${index}`}>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        fillOpacity={0.9}
        rx={2}
      />
      {height > 14 && (
        <text
          x={x + width + 6}
          y={y + height / 2}
          textAnchor="start"
          dominantBaseline="middle"
          className="fill-foreground text-[11px]"
        >
          {payload.displayName}
        </text>
      )}
    </Layer>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: { payload?: Record<string, unknown> } }>;
  usersLabel: string;
}

function CustomTooltip({ active, payload, usersLabel }: CustomTooltipProps) {
  if (!active || !payload?.length) {return null;}
  const data = payload[0]?.payload?.payload;
  if (!data) {return null;}

  // Link tooltip
  if (data.source !== undefined && data.target !== undefined) {
    const src = data.source as SankeyNode | undefined;
    const tgt = data.target as SankeyNode | undefined;
    const sourceName = src?.displayName ?? (data.sourceName as string) ?? '?';
    const targetName = tgt?.displayName ?? (data.targetName as string) ?? '?';
    return (
      <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
        <p className="font-medium text-foreground">
          {sourceName} → {targetName}
        </p>
        <p className="text-muted-foreground mt-1">
          {Number(data.value).toLocaleString()} {usersLabel}
        </p>
      </div>
    );
  }

  // Node tooltip
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{String(data.displayName ?? data.name)}</p>
      <p className="text-muted-foreground mt-1">
        {Number(data.value).toLocaleString()} {usersLabel}
      </p>
    </div>
  );
}

/** Minimum width per step column so labels don't overlap */
const MIN_WIDTH_PER_STEP = 180;

/** Minimum Sankey width for readable rendering on mobile */
const MIN_SANKEY_WIDTH = 600;

export function PathsChart({ transitions, topPaths, compact }: PathsChartProps) {
  const { t } = useLocalTranslation(translations);
  const sankeyData = useMemo(() => toSankeyData(transitions), [transitions]);
  const { ref: containerRef, width: containerWidth, height: containerHeight } = useElementSize();

  if (sankeyData.nodes.length === 0 || sankeyData.links.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        {t('noData')}
      </div>
    );
  }

  // Count unique steps to calculate minimum width
  const maxStep = transitions.reduce((m, t) => Math.max(m, t.step), 0);
  const stepCount = maxStep + 1; // +1 for the target column
  const minWidth = Math.max(stepCount * MIN_WIDTH_PER_STEP, MIN_SANKEY_WIDTH);
  const chartHeight = compact ? Math.max(containerHeight ?? 250, 250) : 400;
  const chartWidth = Math.max(containerWidth || MIN_SANKEY_WIDTH, minWidth);

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Sankey diagram -- scrollable horizontally on mobile */}
      <div
        ref={containerRef}
        className={`${compact ? 'flex-1 min-h-0' : 'h-[400px]'} overflow-x-auto overflow-y-hidden`}
      >
        <div style={{ width: chartWidth, minWidth }}>
          <Sankey
            width={chartWidth}
            height={chartHeight}
            data={sankeyData}
            node={(<CustomNode />) as React.ReactElement<SVGElement>}
            link={{ stroke: 'var(--color-muted-foreground)', strokeOpacity: 0.2 }}
            nodePadding={24}
            nodeWidth={8}
            margin={{ top: 10, right: 120, bottom: 10, left: 10 }}
          >
            <Tooltip content={<CustomTooltip usersLabel={t('users')} />} />
          </Sankey>
        </div>
      </div>

      {/* Top Paths table */}
      {!compact && topPaths.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">{t('topPaths')}</h3>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">{t('columnNumber')}</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">{t('columnPath')}</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">{t('columnUsers')}</th>
                </tr>
              </thead>
              <tbody>
                {topPaths.map((tp, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-2 px-3 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {tp.path.map((event, j) => (
                          <span key={j} className="flex items-center gap-1">
                            {j > 0 && <span className="text-muted-foreground/60">&rarr;</span>}
                            <span className="font-mono text-xs bg-muted/60 rounded px-1.5 py-0.5">
                              {event}
                            </span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums font-medium">
                      {tp.person_count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
