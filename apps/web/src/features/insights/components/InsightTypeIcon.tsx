import { TrendingUp, GitFork, CalendarCheck, HeartPulse, Layers, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InsightType } from '@/api/generated/Api';

interface InsightTypeIconProps {
  type: InsightType;
  className?: string;
}

const TYPE_META = {
  trend:      { Icon: TrendingUp,    colorClass: 'text-blue-400' },
  funnel:     { Icon: GitFork,       colorClass: 'text-violet-400' },
  retention:  { Icon: CalendarCheck, colorClass: 'text-emerald-400' },
  lifecycle:  { Icon: HeartPulse,    colorClass: 'text-rose-400' },
  stickiness: { Icon: Layers,        colorClass: 'text-amber-400' },
} as const;

export function InsightTypeIcon({ type, className }: InsightTypeIconProps) {
  const { Icon, colorClass } = TYPE_META[type] ?? { Icon: Lightbulb, colorClass: 'text-muted-foreground' };
  return <Icon className={cn('h-4 w-4 shrink-0', colorClass, className)} />;
}

export { TYPE_META };
