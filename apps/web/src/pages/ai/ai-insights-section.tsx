import { TrendingUp, TrendingDown, Zap, X, Lightbulb } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useAiInsights, useDismissInsight, type AiInsight } from '@/features/ai/hooks/use-ai-insights';
import translations from './ai-insights-section.translations';
import { formatDate } from '@/lib/formatting';

const INSIGHT_ICONS: Record<AiInsight['type'], typeof TrendingUp> = {
  metric_change: TrendingUp,
  new_event: Zap,
  retention_anomaly: TrendingDown,
  conversion_correlation: Lightbulb,
};

interface InsightCardProps {
  insight: AiInsight;
  dismissTitle: string;
  onDismiss: (id: string) => void;
}

function InsightCard({ insight, dismissTitle, onDismiss }: InsightCardProps) {
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
            title={dismissTitle}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <CardDescription>{insight.description}</CardDescription>
        <p className="text-xs text-muted-foreground mt-2">
          {formatDate(insight.created_at)}
        </p>
      </CardContent>
    </Card>
  );
}

export function AiInsightsSection({ projectId }: { projectId: string }) {
  const { t } = useLocalTranslation(translations);
  const { data: insights, isLoading } = useAiInsights(projectId);
  const dismissMutation = useDismissInsight(projectId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('sectionTitle')}</h2>
        <ListSkeleton count={2} height="h-20" />
      </div>
    );
  }

  if (!insights || insights.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('sectionTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('emptyDescription')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {t('sectionTitleWithCount', { count: String(insights.length) })}
      </h2>
      <div className="space-y-2">
        {insights.map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            dismissTitle={t('dismissTitle')}
            onDismiss={(id) => dismissMutation.mutate(id)}
          />
        ))}
      </div>
    </div>
  );
}
