import type {
  TrendSeriesResult,
  TrendSeries,
  TrendFormula,
  ChartType,
  TrendGranularity,
  Annotation,
  TrendAggregateResult,
} from '@/api/generated/Api';
import { TrendLineBarChart } from './TrendLineBarChart';
import { TrendNumberViz } from './TrendNumberViz';
import { TrendAreaChart } from './TrendAreaChart';
import { TrendCumulativeChart } from './TrendCumulativeChart';
import { TrendPieChart } from './TrendPieChart';
import { TrendTableViz } from './TrendTableViz';
import { TrendValueBarChart } from './TrendValueBarChart';
import { TrendWorldMapViz } from './TrendWorldMapViz';

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
  /** Aggregate data for world_map / calendar_heatmap chart types */
  aggregateData?: TrendAggregateResult;
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

    case 'area':
      return <TrendAreaChart {...rest} />;

    case 'cumulative':
      return <TrendCumulativeChart {...rest} />;

    case 'pie':
      return (
        <TrendPieChart
          series={rest.series}
          compact={rest.compact}
        />
      );

    case 'value_bar':
      return (
        <TrendValueBarChart
          series={rest.series}
          compact={rest.compact}
        />
      );

    case 'table':
      return (
        <TrendTableViz
          series={rest.series}
          previousSeries={rest.previousSeries}
          granularity={rest.granularity}
          compact={rest.compact}
        />
      );

    case 'world_map':
      return (
        <TrendWorldMapViz
          data={rest.aggregateData?.world_map ?? []}
          compact={rest.compact}
        />
      );

    // case 'calendar_heatmap':
    //   return <TrendCalendarHeatmapChart {...rest} />;

    default:
      // Fallback: render as line chart for unimplemented types
      return <TrendLineBarChart chartType="line" {...rest} />;
  }
}
