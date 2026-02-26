import { TrendingUp, TrendingDown, Zap, X, Lightbulb } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { useAiInsights, useDismissInsight, type AiInsight } from '@/features/ai/hooks/use-ai-insights';

const INSIGHT_ICONS: Record<AiInsight['type'], typeof TrendingUp> = {
  metric_change: TrendingUp,
  new_event: Zap,
  retention_anomaly: TrendingDown,
  conversion_correlation: Lightbulb,
};

interface InsightCardProps {
  insight: AiInsight;
  onDismiss: (id: string) => void;
}

function InsightCard({ insight, onDismiss }: InsightCardProps) {
  const Icon = INSIGHT_ICONS[insight.type] ?? Lightbulb;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <CardTitle className="text-sm">{insight.title}</CardTitle>
        </div>
        <CardAction>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onDismiss(insight.id)}
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <CardDescription>{insight.description}</CardDescription>
        <p className="text-xs text-muted-foreground mt-2">
          {new Date(insight.created_at).toLocaleDateString()}
        </p>
      </CardContent>
    </Card>
  );
}

export function AiInsightsSection({ projectId }: { projectId: string }) {
  const { data: insights, isLoading } = useAiInsights(projectId);
  const dismissMutation = useDismissInsight(projectId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Insights</h2>
        <ListSkeleton count={2} height="h-20" />
      </div>
    );
  }

  if (!insights || insights.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Insights</h2>
        <p className="text-sm text-muted-foreground">Analysis will run soon. Check back later for proactive insights about your data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Insights ({insights.length})
      </h2>
      <div className="space-y-2">
        {insights.map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            onDismiss={(id) => dismissMutation.mutate(id)}
          />
        ))}
      </div>
    </div>
  );
}
