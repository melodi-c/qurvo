import type {
  TrendSeriesResult,
  TrendSeries,
  TrendFormula,
  ChartType,
  TrendGranularity,
  Annotation,
} from '@/api/generated/Api';
import { TrendLineBarChart } from './TrendLineBarChart';
import { TrendNumberViz } from './TrendNumberViz';

// Re-export the props type for consumers
export type { TrendLineBarChartProps } from './TrendLineBarChart';

interface TrendChartProps {
  series: TrendSeriesResult[];
  previousSeries?: TrendSeriesResult[];
  chartType: ChartType;
  granularity?: TrendGranularity;
  compact?: boolean;
  formulas?: TrendFormula[];
  annotations?: Annotation[];
  /** Series config for persisted hidden state */
  seriesConfig?: TrendSeries[];
  /** Called when a series is toggled — allows persisting hidden state to config */
  onToggleSeries?: (seriesIdx: number) => void;
  /** CRUD callbacks — when provided, renders interactive annotation overlay */
  onEditAnnotation?: (annotation: Annotation) => void;
  onDeleteAnnotation?: (id: string) => Promise<void>;
  onCreateAnnotation?: (date: string) => void;
}

/**
 * TrendChart dispatcher — delegates rendering to the appropriate chart component
 * based on `chartType`. For not-yet-implemented types, falls back to TrendLineBarChart
 * with line rendering.
 */
export function TrendChart({ chartType, ...rest }: TrendChartProps) {
  // For line and bar, delegate directly to TrendLineBarChart
  // For other types that are not yet implemented, fallback to line chart
  switch (chartType) {
    case 'line':
    case 'bar':
      return <TrendLineBarChart chartType={chartType} {...rest} />;

    case 'number':
      return (
        <TrendNumberViz
          series={rest.series}
          previousSeries={rest.previousSeries}
          compact={rest.compact}
        />
      );

    // Future chart types will get their own components here:
    // case 'area':
    //   return <TrendAreaChart {...rest} />;
    // case 'cumulative':
    //   return <TrendCumulativeChart {...rest} />;
    // case 'value_bar':
    //   return <TrendValueBarChart {...rest} />;
    // case 'table':
    //   return <TrendTableChart {...rest} />;
    // case 'pie':
    //   return <TrendPieChart {...rest} />;
    // case 'world_map':
    //   return <TrendWorldMapChart {...rest} />;
    // case 'calendar_heatmap':
    //   return <TrendCalendarHeatmapChart {...rest} />;

    default:
      // Fallback: render as line chart for unimplemented types
      return <TrendLineBarChart chartType="line" {...rest} />;
  }
}
