import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { GitFork } from 'lucide-react';
import { useDashboardStore } from '../store';
import { FunnelEditor } from './widgets/funnel/FunnelEditor';
import type { FunnelWidgetConfig, Widget, WidgetType } from '../types';

interface AddWidgetDialogProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'pick-type' | 'configure';

const WIDGET_TYPES: {
  type: WidgetType;
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
];

function defaultFunnelConfig(): FunnelWidgetConfig {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return {
    type: 'funnel',
    steps: [
      { event_name: '', label: 'Step 1' },
      { event_name: '', label: 'Step 2' },
    ],
    conversion_window_days: 14,
    date_from: from,
    date_to: to,
  };
}

export function AddWidgetDialog({ open, onClose }: AddWidgetDialogProps) {
  const [step, setStep] = useState<Step>('pick-type');
  const [selectedType, setSelectedType] = useState<WidgetType | null>(null);
  const addWidget = useDashboardStore((s) => s.addWidget);
  const localLayout = useDashboardStore((s) => s.localLayout);

  const handleTypeSelect = (type: WidgetType) => {
    setSelectedType(type);
    setStep('configure');
  };

  const handleConfigSave = (config: FunnelWidgetConfig, name: string) => {
    const maxY = localLayout.reduce((max, l) => Math.max(max, l.y + l.h), 0);
    const newWidget: Widget = {
      id: crypto.randomUUID(),
      dashboard_id: '',
      type: selectedType!,
      name,
      config,
      layout: { x: 0, y: maxY, w: 6, h: 4 },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    addWidget(newWidget);
    handleClose();
  };

  const handleClose = () => {
    setStep('pick-type');
    setSelectedType(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'pick-type' ? 'Add Widget' : `Configure ${selectedType}`}
          </DialogTitle>
        </DialogHeader>

        {step === 'pick-type' && (
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
        )}

        {step === 'configure' && selectedType === 'funnel' && (
          <div className="max-h-[70vh] overflow-auto py-2">
            <FunnelEditor
              initialConfig={defaultFunnelConfig()}
              initialName="New Funnel"
              onSave={handleConfigSave}
              onCancel={() => setStep('pick-type')}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
