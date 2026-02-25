import { CHART_COLORS_HSL, CHART_FORMULA_COLORS_HSL } from '@/lib/chart-colors';

const COLORS = CHART_COLORS_HSL;
const FORMULA_COLORS = CHART_FORMULA_COLORS_HSL;

interface CompactLegendProps {
  allSeriesKeys: string[];
  formulaKeys: string[];
}

export function CompactLegend({ allSeriesKeys, formulaKeys }: CompactLegendProps) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-1.5 px-1">
      {allSeriesKeys.map((key, idx) => (
        <div key={key} className="flex items-center gap-1 min-w-0">
          <span
            className="inline-block h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: COLORS[idx % COLORS.length] }}
          />
          <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{key}</span>
        </div>
      ))}
      {formulaKeys.map((key, idx) => (
        <div key={key} className="flex items-center gap-1 min-w-0">
          <span
            className="inline-block h-2 w-2 rounded-full shrink-0 border border-dashed"
            style={{ borderColor: FORMULA_COLORS[idx % FORMULA_COLORS.length] }}
          />
          <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{key}</span>
        </div>
      ))}
    </div>
  );
}
