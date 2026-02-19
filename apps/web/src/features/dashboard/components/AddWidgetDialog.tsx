import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GitFork, TrendingUp } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDashboardStore } from '../store';
import type { CreateWidgetDtoTypeEnum } from '@/api/generated/Api';

interface AddWidgetDialogProps {
  open: boolean;
  onClose: () => void;
}

const WIDGET_TYPES: {
  type: CreateWidgetDtoTypeEnum;
  label: string;
  description: string;
  icon: typeof GitFork;
}[] = [
  {
    type: 'funnel',
    label: 'Funnel',
    description: 'Measure conversion through a sequence of events',
    icon: GitFork,
  },
  {
    type: 'trend',
    label: 'Trend',
    description: 'Track event trends over time with line or bar charts',
    icon: TrendingUp,
  },
];

export function AddWidgetDialog({ open, onClose }: AddWidgetDialogProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const dashboardId = useDashboardStore((s) => s.dashboardId);

  const handleTypeSelect = (type: CreateWidgetDtoTypeEnum) => {
    onClose();
    navigate(
      `/dashboards/${dashboardId}/widgets/new?type=${type}${projectId ? `&project=${projectId}` : ''}`,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Widget</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          {WIDGET_TYPES.map(({ type, label, description, icon: Icon }) => (
            <button
              key={type}
              onClick={() => handleTypeSelect(type)}
              className="flex flex-col items-start gap-2 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors text-left"
            >
              <Icon className="h-6 w-6 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
