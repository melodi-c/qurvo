import { useState, useMemo, useCallback } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import type { WebAnalyticsDimensionRow } from '@/api/generated/Api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PillToggleGroup } from '@/components/ui/pill-toggle-group';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './WorldMapChart.translations';

const GEO_URL =
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

export type WorldMapMetric = 'visitors' | 'pageviews';

interface TooltipState {
  x: number;
  y: number;
  name: string;
  visitors: number;
  pageviews: number;
}

interface WorldMapChartProps {
  title: string;
  data?: WebAnalyticsDimensionRow[];
  isLoading?: boolean;
  metric?: WorldMapMetric;
  onMetricChange?: (metric: WorldMapMetric) => void;
}

function interpolateColor(t: number): string {
  // From dark muted (#27272a) at t=0 to indigo-400 (#818cf8) at t=1
  const r0 = 0x27, g0 = 0x27, b0 = 0x2a;
  const r1 = 0x81, g1 = 0x8c, b1 = 0xf8;
  const r = Math.round(r0 + (r1 - r0) * t);
  const g = Math.round(g0 + (g1 - g0) * t);
  const b = Math.round(b0 + (b1 - b0) * t);
  return `rgb(${r},${g},${b})`;
}

export function WorldMapChart({
  title,
  data,
  isLoading,
  metric = 'visitors',
  onMetricChange,
}: WorldMapChartProps) {
  const { t } = useLocalTranslation(translations);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const metricOptions = useMemo(
    () => [
      { label: t('visitors'), value: 'visitors' as WorldMapMetric },
      { label: t('pageviews'), value: 'pageviews' as WorldMapMetric },
    ],
    [t],
  );

  const dataMap = useMemo(() => {
    const map = new Map<string, { visitors: number; pageviews: number }>();
    if (!data) return map;
    for (const row of data) {
      if (row.name) {
        map.set(row.name.toUpperCase(), {
          visitors: row.visitors,
          pageviews: row.pageviews,
        });
      }
    }
    return map;
  }, [data]);

  const maxValue = useMemo(() => {
    if (dataMap.size === 0) return 1;
    return Math.max(...Array.from(dataMap.values()).map((v) => v[metric]));
  }, [dataMap, metric]);

  const getFillColor = useCallback(
    (isoA2: string): string => {
      const entry = dataMap.get(isoA2.toUpperCase());
      if (!entry) return '#27272a';
      const value = entry[metric];
      if (!value) return '#27272a';
      const normalized = Math.pow(value / maxValue, 0.4);
      return interpolateColor(normalized);
    },
    [dataMap, metric, maxValue],
  );

  const handlePointerEnter = useCallback(
    (
      event: React.PointerEvent<SVGPathElement>,
      isoA2: string,
      countryName: string,
    ) => {
      const entry = dataMap.get(isoA2.toUpperCase());
      setTooltip({
        x: event.clientX,
        y: event.clientY,
        name: countryName,
        visitors: entry?.visitors ?? 0,
        pageviews: entry?.pageviews ?? 0,
      });
    },
    [dataMap],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGPathElement>) => {
      setTooltip((prev) =>
        prev ? { ...prev, x: event.clientX, y: event.clientY } : prev,
      );
    },
    [],
  );

  const handlePointerLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const isEmpty = !isLoading && (!data || data.length === 0);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">{title}</CardTitle>
        {onMetricChange && !isLoading && !isEmpty && (
          <PillToggleGroup
            options={metricOptions}
            value={metric}
            onChange={onMetricChange}
            className="w-auto"
          />
        )}
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        {isLoading ? (
          <Skeleton className="h-[180px] w-full rounded-lg" />
        ) : isEmpty ? (
          <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
            {t('noData')}
          </div>
        ) : (
          <div className="relative select-none">
            <ComposableMap
              projection="geoMercator"
              projectionConfig={{ scale: 110, center: [0, 30] }}
              width={800}
              height={300}
              style={{ width: '100%', height: 'auto' }}
            >
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const isoA2: string =
                      geo.properties?.iso_a2 ?? geo.properties?.ISO_A2 ?? '';
                    const name: string =
                      geo.properties?.name ?? geo.properties?.NAME ?? '';
                    const fill = getFillColor(isoA2);
                    const hasData = dataMap.has(isoA2.toUpperCase());
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={fill}
                        stroke="#09090b"
                        strokeWidth={0.5}
                        style={{
                          default: {
                            outline: 'none',
                            cursor: hasData ? 'pointer' : 'default',
                          },
                          hover: {
                            outline: 'none',
                            fill: hasData ? '#a5b4fc' : '#3f3f46',
                            cursor: hasData ? 'pointer' : 'default',
                          },
                          pressed: { outline: 'none' },
                        }}
                        onPointerEnter={(e) =>
                          handlePointerEnter(e, isoA2, name)
                        }
                        onPointerMove={handlePointerMove}
                        onPointerLeave={handlePointerLeave}
                      />
                    );
                  })
                }
              </Geographies>
            </ComposableMap>

            {/* Color legend */}
            <div className="mt-1 flex items-center gap-2 px-1">
              <span className="text-[10px] text-muted-foreground">0</span>
              <div
                className="h-2 flex-1 rounded-sm"
                style={{
                  background: 'linear-gradient(to right, #27272a, #818cf8)',
                }}
              />
              <span className="text-[10px] text-muted-foreground">{t('legendMax')}</span>
            </div>

            {tooltip && (
              <div
                className="pointer-events-none fixed z-50 rounded-md px-3 py-2 text-xs shadow-md"
                style={{
                  left: tooltip.x + 12,
                  top: tooltip.y - 40,
                  backgroundColor: 'var(--color-popover)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-popover-foreground)',
                }}
              >
                <div className="font-medium">{tooltip.name}</div>
                {tooltip.visitors > 0 && (
                  <div className="text-muted-foreground">
                    {tooltip.visitors.toLocaleString()} {t('visitors')}
                  </div>
                )}
                {tooltip.pageviews > 0 && (
                  <div className="text-muted-foreground">
                    {tooltip.pageviews.toLocaleString()} {t('pageviews')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
