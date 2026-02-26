import { useState, useMemo } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import type { WebAnalyticsDimensionRow } from '@/api/generated/Api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './WorldMapChart.translations';

const GEO_URL =
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

interface TooltipState {
  x: number;
  y: number;
  name: string;
  visitors: number;
}

interface WorldMapChartProps {
  title: string;
  data?: WebAnalyticsDimensionRow[];
  isLoading?: boolean;
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

export function WorldMapChart({ title, data, isLoading }: WorldMapChartProps) {
  const { t } = useLocalTranslation(translations);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const visitorMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!data) return map;
    for (const row of data) {
      if (row.name) map.set(row.name.toUpperCase(), row.visitors);
    }
    return map;
  }, [data]);

  const maxVisitors = useMemo(() => {
    if (visitorMap.size === 0) return 1;
    return Math.max(...visitorMap.values());
  }, [visitorMap]);

  function getFillColor(isoA2: string): string {
    const visitors = visitorMap.get(isoA2.toUpperCase());
    if (!visitors) return '#27272a';
    const t = Math.pow(visitors / maxVisitors, 0.4);
    return interpolateColor(t);
  }

  function handlePointerEnter(
    event: React.PointerEvent<SVGPathElement>,
    isoA2: string,
    countryName: string,
  ) {
    const visitors = visitorMap.get(isoA2.toUpperCase()) ?? 0;
    setTooltip({
      x: event.clientX,
      y: event.clientY,
      name: countryName,
      visitors,
    });
  }

  function handlePointerMove(event: React.PointerEvent<SVGPathElement>) {
    setTooltip((prev) =>
      prev ? { ...prev, x: event.clientX, y: event.clientY } : prev,
    );
  }

  function handlePointerLeave() {
    setTooltip(null);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        {isLoading ? (
          <Skeleton className="h-[240px] w-full rounded-lg" />
        ) : (
          <div className="relative select-none">
            <ComposableMap
              projection="geoMercator"
              projectionConfig={{ scale: 110, center: [0, 30] }}
              width={800}
              height={380}
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
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={fill}
                        stroke="#09090b"
                        strokeWidth={0.5}
                        style={{
                          default: { outline: 'none', cursor: visitorMap.has(isoA2.toUpperCase()) ? 'pointer' : 'default' },
                          hover: { outline: 'none', fill: visitorMap.has(isoA2.toUpperCase()) ? '#a5b4fc' : '#3f3f46', cursor: visitorMap.has(isoA2.toUpperCase()) ? 'pointer' : 'default' },
                          pressed: { outline: 'none' },
                        }}
                        onPointerEnter={(e) => handlePointerEnter(e, isoA2, name)}
                        onPointerMove={handlePointerMove}
                        onPointerLeave={handlePointerLeave}
                      />
                    );
                  })
                }
              </Geographies>
            </ComposableMap>

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
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
