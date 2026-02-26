import { useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import type { WebAnalyticsDimensionRow } from '@/api/generated/Api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { TabNav } from '@/components/ui/tab-nav';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './GeographySection.translations';

const GEO_URL =
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

interface TooltipState {
  x: number;
  y: number;
  name: string;
  visitors: number;
}

interface GeographySectionProps {
  countries?: WebAnalyticsDimensionRow[];
  regions?: WebAnalyticsDimensionRow[];
  cities?: WebAnalyticsDimensionRow[];
  isLoading: boolean;
  isError?: boolean;
}

function interpolateColor(t: number): string {
  const r0 = 0x27, g0 = 0x27, b0 = 0x2a;
  const r1 = 0x81, g1 = 0x8c, b1 = 0xf8;
  const r = Math.round(r0 + (r1 - r0) * t);
  const g = Math.round(g0 + (g1 - g0) * t);
  const b = Math.round(b0 + (b1 - b0) * t);
  return `rgb(${r},${g},${b})`;
}

export function GeographySection({
  countries,
  regions,
  cities,
  isLoading,
  isError,
}: GeographySectionProps) {
  const { t } = useLocalTranslation(translations);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const geoTabs = useMemo(
    () =>
      [
        { id: 'countries' as const, label: t('countries') },
        { id: 'regions' as const, label: t('regions') },
        { id: 'cities' as const, label: t('cities') },
      ],
    [t],
  );

  const [activeTab, setActiveTab] = useState<'countries' | 'regions' | 'cities'>('countries');

  const tabData: Record<'countries' | 'regions' | 'cities', WebAnalyticsDimensionRow[] | undefined> =
    useMemo(
      () => ({ countries, regions, cities }),
      [countries, regions, cities],
    );

  const visitorMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!countries) return map;
    for (const row of countries) {
      if (row.name) map.set(row.name.toUpperCase(), row.visitors);
    }
    return map;
  }, [countries]);

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
    setTooltip({ x: event.clientX, y: event.clientY, name: countryName, visitors });
  }

  function handlePointerMove(event: React.PointerEvent<SVGPathElement>) {
    setTooltip((prev) =>
      prev ? { ...prev, x: event.clientX, y: event.clientY } : prev,
    );
  }

  function handlePointerLeave() {
    setTooltip(null);
  }

  const isMapEmpty = !isLoading && (!countries || countries.length === 0);
  const rows = tabData[activeTab] ?? [];
  const maxRowVisitors = rows.length > 0 ? Math.max(...rows.map((r) => r.visitors)) : 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{t('geography')}</CardTitle>
      </CardHeader>

      {/* Map section */}
      <CardContent className="pt-0 pb-3">
        {isLoading ? (
          <Skeleton className="h-[180px] w-full rounded-lg" />
        ) : isMapEmpty ? (
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
                            cursor: visitorMap.has(isoA2.toUpperCase()) ? 'pointer' : 'default',
                          },
                          hover: {
                            outline: 'none',
                            fill: visitorMap.has(isoA2.toUpperCase()) ? '#a5b4fc' : '#3f3f46',
                            cursor: visitorMap.has(isoA2.toUpperCase()) ? 'pointer' : 'default',
                          },
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

      <Separator />

      {/* Dimension tile section */}
      <TabNav tabs={geoTabs} value={activeTab} onChange={setActiveTab} className="px-6" />
      <CardContent className="pt-3">
        {isError ? (
          <p className="text-sm text-destructive/80 py-6 text-center">{t('loadError')}</p>
        ) : isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 rounded" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t('noData')}</p>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wide px-2 pb-1">
              <span className="min-w-0 flex-1 truncate">{t('name')}</span>
              <span className="w-16 text-right sm:w-20">{t('tableVisitors')}</span>
              <span className="hidden w-16 text-right sm:block sm:w-20">{t('tableViews')}</span>
            </div>
            {rows.map((row) => (
              <div key={row.name} className="relative flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                <div
                  className="absolute inset-y-0 left-0 rounded-md bg-primary/5"
                  style={{ width: `${(row.visitors / maxRowVisitors) * 100}%` }}
                />
                <span className="relative min-w-0 flex-1 truncate text-foreground/80">{row.name}</span>
                <span className="relative w-16 text-right tabular-nums text-foreground/70 sm:w-20">
                  {row.visitors.toLocaleString()}
                </span>
                <span className="relative hidden w-16 text-right tabular-nums text-muted-foreground sm:block sm:w-20">
                  {row.pageviews.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
