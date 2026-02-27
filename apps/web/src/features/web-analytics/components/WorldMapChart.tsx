import { useState, useMemo, useCallback } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import type { WebAnalyticsDimensionRow } from '@/api/generated/Api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PillToggleGroup } from '@/components/ui/pill-toggle-group';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import {
  MAP_COLOR_EMPTY,
  MAP_COLOR_FROM,
  MAP_COLOR_TO,
  MAP_STROKE_COLOR,
  MAP_HOVER_WITH_DATA_COLOR,
  MAP_HOVER_NO_DATA_COLOR,
  interpolateMapColor,
} from '@/lib/chart-colors';
import { isoNumericToAlpha2 } from '../lib/iso-numeric-to-alpha2';
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
      if (!entry) return MAP_COLOR_EMPTY;
      const value = entry[metric];
      if (!value) return MAP_COLOR_EMPTY;
      const normalized = Math.pow(value / maxValue, 0.4);
      return interpolateMapColor(normalized);
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
                    const isoA2: string = isoNumericToAlpha2(String(geo.id ?? ''));
                    const name: string =
                      geo.properties?.name ?? geo.properties?.NAME ?? '';
                    const fill = getFillColor(isoA2);
                    const hasData = dataMap.has(isoA2.toUpperCase());
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={fill}
                        stroke={MAP_STROKE_COLOR}
                        strokeWidth={0.5}
                        style={{
                          default: {
                            outline: 'none',
                            cursor: hasData ? 'pointer' : 'default',
                          },
                          hover: {
                            outline: 'none',
                            fill: hasData ? MAP_HOVER_WITH_DATA_COLOR : MAP_HOVER_NO_DATA_COLOR,
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
                  background: `linear-gradient(to right, ${MAP_COLOR_FROM}, ${MAP_COLOR_TO})`,
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
