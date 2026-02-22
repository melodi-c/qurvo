import { Plus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import type { InsightType } from '@/api/generated/Api';

const NEW_INSIGHT_TYPES: { type: InsightType; label: string; description: string; path: string }[] = [
  {
    type: 'trend',
    label: 'Trend',
    description: 'Track event counts over time',
    path: '/insights/trends/new',
  },
  {
    type: 'funnel',
    label: 'Funnel',
    description: 'Measure conversion through steps',
    path: '/insights/funnels/new',
  },
  {
    type: 'retention',
    label: 'Retention',
    description: 'See how users return over time',
    path: '/insights/retentions/new',
  },
  {
    type: 'lifecycle',
    label: 'Lifecycle',
    description: 'Track user growth dynamics',
    path: '/insights/lifecycles/new',
  },
  {
    type: 'stickiness',
    label: 'Stickiness',
    description: 'Measure engagement frequency',
    path: '/insights/stickiness/new',
  },
  {
    type: 'paths',
    label: 'Paths',
    description: 'Explore user journey flows',
    path: '/insights/paths/new',
  },
];

export function NewInsightDropdown() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') ?? '';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New insight
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Choose type</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {NEW_INSIGHT_TYPES.map(({ type, label, description, path }) => (
          <DropdownMenuItem
            key={type}
            onClick={() => navigate(`${path}?project=${projectId}`)}
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
