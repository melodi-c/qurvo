import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { InsightTypeIcon } from './InsightTypeIcon';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './NewInsightDropdown.translations';
import type { InsightType } from '@/api/generated/Api';

export function NewInsightDropdown() {
  const { go } = useAppNavigate();
  const { t } = useLocalTranslation(translations);

  const insightTypes: { type: InsightType; label: string; description: string }[] = [
    { type: 'trend', label: t('trend'), description: t('trendDesc') },
    { type: 'funnel', label: t('funnel'), description: t('funnelDesc') },
    { type: 'retention', label: t('retention'), description: t('retentionDesc') },
    { type: 'lifecycle', label: t('lifecycle'), description: t('lifecycleDesc') },
    { type: 'stickiness', label: t('stickiness'), description: t('stickinessDesc') },
    { type: 'paths', label: t('paths'), description: t('pathsDesc') },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          {t('newInsight')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t('chooseType')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {insightTypes.map(({ type, label, description }) => (
          <DropdownMenuItem
            key={type}
            onClick={() => go.insights.newByType(type)}
            className="flex flex-col items-start gap-0.5 py-2"
          >
            <span className="flex items-center gap-2 font-medium text-sm">
              <InsightTypeIcon type={type} />
              {label}
            </span>
            <span className="text-xs text-muted-foreground pl-6">{description}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
