import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { GripVertical } from 'lucide-react';
import { useDashboardStore } from '../store';
import { WidgetMenu } from './WidgetMenu';
import { FunnelWidget } from './widgets/funnel/FunnelWidget';
import { TrendWidget } from './widgets/trend/TrendWidget';
import { RetentionWidget } from './widgets/retention/RetentionWidget';
import { LifecycleWidget } from './widgets/lifecycle/LifecycleWidget';
import { StickinessWidget } from './widgets/stickiness/StickinessWidget';
import { PathsWidget } from './widgets/paths/PathsWidget';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './WidgetCard.translations';
import type { Widget } from '@/api/generated/Api';

export function WidgetCard({ widget }: { widget: Widget }) {
  const { t } = useLocalTranslation(translations);
  const isEditing = useDashboardStore((s) => s.isEditing);
  const insightType = widget.insight?.type;
  const displayName = widget.insight?.name || t('untitled');

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between py-2 px-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {isEditing && (
            <span className="drag-handle cursor-grab active:cursor-grabbing text-muted-foreground flex-shrink-0">
              <GripVertical className="h-4 w-4" />
            </span>
          )}
          <CardTitle className="text-sm font-medium truncate">{displayName}</CardTitle>
        </div>
        {isEditing && <WidgetMenu widget={widget} />}
      </CardHeader>
      <CardContent className="flex-1 p-3 min-h-0">
        {insightType === 'funnel' && <FunnelWidget widget={widget} />}
        {insightType === 'trend' && <TrendWidget widget={widget} />}
        {insightType === 'retention' && <RetentionWidget widget={widget} />}
        {insightType === 'lifecycle' && <LifecycleWidget widget={widget} />}
        {insightType === 'stickiness' && <StickinessWidget widget={widget} />}
        {insightType === 'paths' && <PathsWidget widget={widget} />}
        {!insightType && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            {t('noInsightLinked')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
