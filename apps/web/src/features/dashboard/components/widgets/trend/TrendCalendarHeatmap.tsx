import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type { HeatmapRow } from '@/api/generated/Api';
import { interpolateMapColor, CHART_TOOLTIP_STYLE } from '@/lib/chart-colors';
import { formatCompactNumber } from '@/lib/formatting';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './TrendCalendarHeatmap.translations';

/** Day-of-week keys ordered Monday(1) through Sunday(7), matching ClickHouse toDayOfWeek(). */
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const ROWS = 7;
const COLS = 24;

/** Minimum opacity for cells with zero/no data so the grid shape is visible. */
const MIN_OPACITY_FILL = 'rgba(39,39,42,0.35)';

interface TrendCalendarHeatmapProps {
  data: HeatmapRow[];
  compact?: boolean;
}

interface TooltipState {
  x: number;
  y: number;
  day: string;
  hour: number;
  value: number;
}

export function TrendCalendarHeatmap({ data, compact }: TrendCalendarHeatmapProps) {
  const { t } = useLocalTranslation(translations);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Day labels in display order (Mon-Sun)
  const dayLabels = useMemo(
    () => DAY_KEYS.map((key) => t(key)),
    [t],
  );

  // Build a lookup map: `${dayOfWeek}-${hourOfDay}` -> value
  const { grid, maxValue } = useMemo(() => {
    const map = new Map<string, number>();
    let max = 0;
    for (const row of data) {
      const key = `${row.day_of_week}-${row.hour_of_day}`;
      map.set(key, row.value);
      if (row.value > max) {max = row.value;}
    }
    return { grid: map, maxValue: max };
  }, [data]);

  // Observe container width for responsive cell sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {return;}
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<SVGRectElement>, day: number, hour: number, value: number) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const container = containerRef.current?.getBoundingClientRect();
      if (!container) {return;}
      setTooltip({
        x: rect.left - container.left + rect.width / 2,
        y: rect.top - container.top,
        day: dayLabels[day],
        hour,
        value,
      });
    },
    [dayLabels],
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        {t('noData')}
      </div>
    );
  }

  // Layout calculations
  const labelWidth = compact ? 24 : 36;
  const headerHeight = compact ? 16 : 22;
  const gap = compact ? 1 : 2;
  const availableWidth = containerWidth - labelWidth;
  const cellSize = availableWidth > 0 ? Math.max(4, (availableWidth - gap * (COLS - 1)) / COLS) : 12;
  const svgWidth = labelWidth + COLS * cellSize + (COLS - 1) * gap;
  const svgHeight = headerHeight + ROWS * cellSize + (ROWS - 1) * gap;
  const fontSize = compact ? 8 : 10;

  return (
    <div ref={containerRef} className={compact ? 'h-full flex flex-col' : ''} style={{ position: 'relative' }}>
      <svg
        width="100%"
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMinYMin meet"
        className={compact ? 'flex-1 min-h-0' : ''}
      >
        {/* Hour labels (top axis) */}
        {HOURS.map((hour) => {
          // Show every 3rd label in compact, every 2nd in full
          if (compact && hour % 3 !== 0) {return null;}
          if (!compact && hour % 2 !== 0) {return null;}
          const x = labelWidth + hour * (cellSize + gap) + cellSize / 2;
          return (
            <text
              key={`h-${hour}`}
              x={x}
              y={headerHeight - 4}
              textAnchor="middle"
              fill="var(--color-muted-foreground)"
              fontSize={fontSize}
            >
              {hour}
            </text>
          );
        })}

        {/* Day-of-week labels (left axis) + grid cells */}
        {Array.from({ length: ROWS }, (_, dayIdx) => {
          const cy = headerHeight + dayIdx * (cellSize + gap) + cellSize / 2;
          return (
            <g key={`row-${dayIdx}`}>
              <text
                x={labelWidth - 4}
                y={cy}
                textAnchor="end"
                dominantBaseline="central"
                fill="var(--color-muted-foreground)"
                fontSize={fontSize}
              >
                {dayLabels[dayIdx]}
              </text>

              {HOURS.map((hour) => {
                // day_of_week: 1=Monday ... 7=Sunday -> dayIdx 0-6
                const key = `${dayIdx + 1}-${hour}`;
                const value = grid.get(key) ?? 0;
                const t_val = maxValue > 0 ? value / maxValue : 0;
                const fill = value > 0 ? interpolateMapColor(t_val) : MIN_OPACITY_FILL;
                const rx = labelWidth + hour * (cellSize + gap);
                const ry = headerHeight + dayIdx * (cellSize + gap);

                return (
                  <rect
                    key={key}
                    x={rx}
                    y={ry}
                    width={cellSize}
                    height={cellSize}
                    rx={compact ? 1 : 2}
                    fill={fill}
                    className="transition-opacity"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => handleMouseEnter(e, dayIdx, hour, value)}
                    onMouseLeave={handleMouseLeave}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            ...CHART_TOOLTIP_STYLE,
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y - 8,
            transform: 'translate(-50%, -100%)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 50,
          }}
          className="px-3 py-2 shadow-lg"
        >
          <p className="text-xs font-medium text-foreground">
            {tooltip.day}, {String(tooltip.hour).padStart(2, '0')}:00
          </p>
          <p className="text-xs text-muted-foreground">
            {t('value')}: {formatCompactNumber(tooltip.value)}
          </p>
        </div>
      )}
    </div>
  );
}
