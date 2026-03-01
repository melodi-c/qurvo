import { useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import type { AdminPlan, CreatePlanFeatures } from '@/api/generated/Api';
import { usePlanForm } from './use-plan-form';
import translations from './admin-plans-page.translations';

const FEATURE_KEYS: (keyof CreatePlanFeatures)[] = [
  'cohorts',
  'lifecycle',
  'stickiness',
  'api_export',
  'ai_insights',
];

type FeatureTranslationKey =
  | 'featureCohorts'
  | 'featureLifecycle'
  | 'featureStickiness'
  | 'featureApiExport'
  | 'featureAiInsights';

const FEATURE_LABEL_MAP: Record<keyof CreatePlanFeatures, FeatureTranslationKey> = {
  cohorts: 'featureCohorts',
  lifecycle: 'featureLifecycle',
  stickiness: 'featureStickiness',
  api_export: 'featureApiExport',
  ai_insights: 'featureAiInsights',
};

interface PlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan?: AdminPlan;
  onSuccess: () => void;
}

export function PlanDialog({ open, onOpenChange, plan, onSuccess }: PlanDialogProps) {
  const { t } = useLocalTranslation(translations);
  const { values, setValues, resetValues, isEdit, isPending, handleSubmit, toggleFeature } =
    usePlanForm(plan, onOpenChange, onSuccess);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        resetValues(plan);
      }
      onOpenChange(nextOpen);
    },
    [plan, onOpenChange, resetValues],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editTitle') : t('createTitle')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="plan-name">{t('name')}</Label>
            <Input
              id="plan-name"
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              placeholder={t('namePlaceholder')}
              required
              autoFocus
            />
          </div>

          {/* Slug -- only shown on create */}
          {!isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="plan-slug">{t('slug')}</Label>
              <Input
                id="plan-slug"
                value={values.slug}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
                  }))
                }
                placeholder={t('slugPlaceholder')}
                pattern="[a-z0-9_-]+"
                title={t('slugPattern')}
                required
              />
            </div>
          )}

          {/* Events limit */}
          <div className="space-y-1.5">
            <Label htmlFor="plan-events-limit">{t('eventsLimit')}</Label>
            <Input
              id="plan-events-limit"
              type="number"
              min={0}
              value={values.events_limit}
              onChange={(e) => setValues((v) => ({ ...v, events_limit: e.target.value }))}
              placeholder={t('eventsLimitPlaceholder')}
            />
          </div>

          {/* Data retention */}
          <div className="space-y-1.5">
            <Label htmlFor="plan-retention">{t('dataRetentionDays')}</Label>
            <Input
              id="plan-retention"
              type="number"
              min={1}
              value={values.data_retention_days}
              onChange={(e) => setValues((v) => ({ ...v, data_retention_days: e.target.value }))}
              placeholder={t('dataRetentionDaysPlaceholder')}
            />
          </div>

          {/* Max projects */}
          <div className="space-y-1.5">
            <Label htmlFor="plan-max-projects">{t('maxProjects')}</Label>
            <Input
              id="plan-max-projects"
              type="number"
              min={1}
              value={values.max_projects}
              onChange={(e) => setValues((v) => ({ ...v, max_projects: e.target.value }))}
              placeholder={t('maxProjectsPlaceholder')}
            />
          </div>

          {/* AI messages per month */}
          <div className="space-y-1.5">
            <Label htmlFor="plan-ai-messages">{t('aiMessagesPerMonth')}</Label>
            <Input
              id="plan-ai-messages"
              type="number"
              min={0}
              value={values.ai_messages_per_month}
              onChange={(e) => setValues((v) => ({ ...v, ai_messages_per_month: e.target.value }))}
              placeholder={t('aiMessagesPlaceholder')}
            />
          </div>

          {/* is_public */}
          <div className="flex items-center gap-2">
            <input
              id="plan-is-public"
              type="checkbox"
              checked={values.is_public}
              onChange={(e) => setValues((v) => ({ ...v, is_public: e.target.checked }))}
              className="rounded border-border"
            />
            <Label htmlFor="plan-is-public" className="cursor-pointer">
              {t('isPublicLabel')}
            </Label>
          </div>

          {/* Features */}
          <div className="space-y-2">
            <Label>{t('featuresLabel')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {FEATURE_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={values.features[key]}
                    onChange={() => toggleFeature(key)}
                    className="rounded border-border"
                  />
                  <span className="text-sm">{t(FEATURE_LABEL_MAP[key])}</span>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? t('save') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
