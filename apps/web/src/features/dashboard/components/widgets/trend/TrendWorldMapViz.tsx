import { useMemo, useState, useCallback } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import type { WorldMapRow } from '@/api/generated/Api';
import {
  MAP_COLOR_EMPTY,
  MAP_COLOR_FROM,
  MAP_COLOR_TO,
  MAP_STROKE_COLOR,
  MAP_HOVER_WITH_DATA_COLOR,
  MAP_HOVER_NO_DATA_COLOR,
  interpolateMapColor,
} from '@/lib/chart-colors';
import { formatCompactNumber } from '@/lib/formatting';
import { isoNumericToAlpha2 } from '@/features/web-analytics/lib/iso-numeric-to-alpha2';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './TrendWorldMapViz.translations';

const GEO_URL =
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

interface TooltipState {
  x: number;
  y: number;
  name: string;
  value: number;
}

interface TrendWorldMapVizProps {
  data: WorldMapRow[];
  compact?: boolean;
}

export function TrendWorldMapViz({ data, compact }: TrendWorldMapVizProps) {
  const { t } = useLocalTranslation(translations);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const dataMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of data) {
      if (row.country) {
        map.set(row.country.toUpperCase(), row.value);
      }
    }
    return map;
  }, [data]);

  const maxValue = useMemo(() => {
    if (dataMap.size === 0) {return 1;}
    return Math.max(...Array.from(dataMap.values()));
  }, [dataMap]);

  const getFillColor = useCallback(
    (isoA2: string): string => {
      const value = dataMap.get(isoA2.toUpperCase());
      if (!value) {return MAP_COLOR_EMPTY;}
      const normalized = Math.pow(value / maxValue, 0.4);
      return interpolateMapColor(normalized);
    },
    [dataMap, maxValue],
  );

  const handlePointerEnter = useCallback(
    (
      event: React.PointerEvent<SVGPathElement>,
      isoA2: string,
      countryName: string,
    ) => {
      const value = dataMap.get(isoA2.toUpperCase()) ?? 0;
      setTooltip({
        x: event.clientX,
        y: event.clientY,
        name: countryName,
        value,
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

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('noData')}
      </div>
    );
  }

  const mapHeight = compact ? 200 : 340;

  return (
    <div className={compact ? 'h-full flex flex-col' : ''}>
      <div className={`relative select-none ${compact ? 'flex-1 min-h-0' : ''}`}>
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: compact ? 90 : 120, center: [0, 30] }}
          width={800}
          height={mapHeight}
          style={{ width: '100%', height: 'auto' }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const isoA2 = isoNumericToAlpha2(String(geo.id ?? ''));
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
                        fill: hasData
                          ? MAP_HOVER_WITH_DATA_COLOR
                          : MAP_HOVER_NO_DATA_COLOR,
                        cursor: hasData ? 'pointer' : 'default',
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

        {/* Color legend */}
        <div className="mt-1 flex items-center gap-2 px-1">
          <span className="text-[10px] text-muted-foreground">0</span>
          <div
            className="h-2 flex-1 rounded-sm"
            style={{
              background: `linear-gradient(to right, ${MAP_COLOR_FROM}, ${MAP_COLOR_TO})`,
            }}
          />
          <span className="text-[10px] text-muted-foreground">
            {formatCompactNumber(maxValue)}
          </span>
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
            {tooltip.value > 0 && (
              <div className="text-muted-foreground">
                {t('value')}: {formatCompactNumber(tooltip.value)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
