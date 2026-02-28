import { useMemo } from 'react';
import { Loader2, TrendingUp, Filter, Users, Activity, Zap, GitBranch, List, Bookmark, LayoutDashboard, PlusSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { getGranularityLabel } from '@/lib/i18n-utils';
import translations from './ai-tool-progress.translations';
import { formatShortDateRange } from '@/lib/formatting';

interface AiToolProgressProps {
  toolName: string;
  toolArgs: Record<string, unknown>;
}

const TOOL_ICONS: Record<string, React.ElementType> = {
  query_trend: TrendingUp,
  query_funnel: Filter,
  query_retention: Users,
  query_lifecycle: Activity,
  query_stickiness: Zap,
  query_paths: GitBranch,
  list_event_names: List,
  create_insight: Bookmark,
  list_dashboards: LayoutDashboard,
  save_to_dashboard: PlusSquare,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDetails(toolName: string, args: Record<string, unknown>, t: (key: any, vars?: Record<string, string>) => string): string[] {
  const details: string[] = [];
  const dateRange = formatShortDateRange(args.date_from, args.date_to);

  switch (toolName) {
    case 'query_trend': {
      const series = args.series;
      if (Array.isArray(series) && series.length > 0) {
        if (series.length === 1 && typeof (series[0] as Record<string, unknown>).event_name === 'string') {
          details.push(`\`${(series[0] as Record<string, unknown>).event_name as string}\``);
        } else {
          details.push(t('series', { count: String(series.length) }));
        }
      }
      if (typeof args.granularity === 'string') {details.push(getGranularityLabel(args.granularity));}
      if (dateRange) {details.push(dateRange);}
      break;
    }
    case 'query_funnel': {
      const steps = args.steps;
      if (Array.isArray(steps) && steps.length > 0) {
        details.push(t('steps', { count: String(steps.length) }));
      }
      if (dateRange) {details.push(dateRange);}
      break;
    }
    case 'query_retention':
    case 'query_lifecycle':
    case 'query_stickiness': {
      if (typeof args.target_event === 'string') {
        details.push(`\`${args.target_event}\``);
      }
      if (typeof args.granularity === 'string') {details.push(getGranularityLabel(args.granularity));}
      if (dateRange) {details.push(dateRange);}
      break;
    }
    case 'query_paths': {
      if (typeof args.start_event === 'string') {
        details.push(t('startEvent', { name: args.start_event }));
      }
      if (typeof args.end_event === 'string') {
        details.push(t('endEvent', { name: args.end_event }));
      }
      if (dateRange) {details.push(dateRange);}
      break;
    }
    default:
      break;
  }

  return details;
}

function parseDetailParts(detail: string): Array<{ type: 'text' | 'code'; value: string }> {
  const parts: Array<{ type: 'text' | 'code'; value: string }> = [];
  const regex = /`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(detail)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: detail.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', value: match[1] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < detail.length) {
    parts.push({ type: 'text', value: detail.slice(lastIndex) });
  }
  return parts;
}

export function AiToolProgress({ toolName, toolArgs }: AiToolProgressProps) {
  const { t } = useLocalTranslation(translations);

  const label = useMemo(() => {
    const key = toolName as keyof typeof translations.en;
    return key in translations.en ? t(key) : t('runningTool');
  }, [toolName, t]);

  const details = useMemo(() => buildDetails(toolName, toolArgs, t), [toolName, toolArgs, t]);

  const Icon = TOOL_ICONS[toolName] ?? Loader2;

  return (
    <div className="flex items-start gap-3 py-1">
      <div className="flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5 bg-accent text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex items-center gap-2 min-h-7">
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
            'bg-accent/50 text-muted-foreground',
          )}
        >
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
          <span className="font-medium text-foreground">{label}</span>
          {details.length > 0 && (
            <>
              <span className="text-muted-foreground/60">·</span>
              {details.map((detail, i) => (
                <span key={i} className="flex items-center gap-1">
                  {parseDetailParts(detail).map((part, j) =>
                    part.type === 'code' ? (
                      <code
                        key={j}
                        className="bg-muted/60 text-foreground rounded px-1 py-0.5 text-xs font-mono"
                      >
                        {part.value}
                      </code>
                    ) : (
                      <span key={j} className="text-muted-foreground">
                        {part.value}
                      </span>
                    ),
                  )}
                  {i < details.length - 1 && (
                    <span className="text-muted-foreground/60 ml-1">·</span>
                  )}
                </span>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
