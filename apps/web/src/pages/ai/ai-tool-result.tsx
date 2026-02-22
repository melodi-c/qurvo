import { Card, CardContent } from '@/components/ui/card';
import { TrendChart } from '@/features/dashboard/components/widgets/trend/TrendChart';
import { FunnelChart } from '@/features/dashboard/components/widgets/funnel/FunnelChart';
import { RetentionChart } from '@/features/dashboard/components/widgets/retention/RetentionChart';
import { LifecycleChart } from '@/features/dashboard/components/widgets/lifecycle/LifecycleChart';
import { StickinessChart } from '@/features/dashboard/components/widgets/stickiness/StickinessChart';

interface AiToolResultProps {
  toolName: string;
  result: any;
  visualizationType: string | null;
}

export function AiToolResult({ toolName, result, visualizationType }: AiToolResultProps) {
  if (!result || !visualizationType) return null;

  return (
    <Card className="my-2">
      <CardContent className="pt-4 pb-3">
        {visualizationType === 'trend_chart' && result.series && (
          <TrendChart
            series={result.series}
            previousSeries={result.series_previous}
            chartType="line"
            granularity={result.granularity}
            compact
          />
        )}
        {visualizationType === 'funnel_chart' && result.steps && (
          <FunnelChart
            steps={result.steps}
            breakdown={result.breakdown}
            aggregateSteps={result.aggregate_steps}
            compact
          />
        )}
        {visualizationType === 'retention_chart' && result.cohorts && (
          <RetentionChart result={result} compact />
        )}
        {visualizationType === 'lifecycle_chart' && result.data && (
          <LifecycleChart result={result} compact />
        )}
        {visualizationType === 'stickiness_chart' && result.data && (
          <StickinessChart result={result} compact />
        )}
      </CardContent>
    </Card>
  );
}
