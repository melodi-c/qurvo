import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, CreditCard, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { api } from '@/api/client';
import type { AdminPlan, CreateAdminPlan, PatchAdminPlan, CreatePlanFeatures } from '@/api/generated/Api';
import translations from './admin-plans-page.translations';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLimit(value: number | null | undefined, unlimited: string): string {
  if (value === null || value === undefined || value === -1) {return unlimited;}
  return value.toLocaleString();
}

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

// ---------------------------------------------------------------------------
// Plan form state
// ---------------------------------------------------------------------------

interface PlanFormValues {
  name: string;
  slug: string;
  events_limit: string;
  data_retention_days: string;
  max_projects: string;
  ai_messages_per_month: string;
  is_public: boolean;
  features: CreatePlanFeatures;
}

function defaultFormValues(): PlanFormValues {
  return {
    name: '',
    slug: '',
    events_limit: '',
    data_retention_days: '',
    max_projects: '',
    ai_messages_per_month: '',
    is_public: false,
    features: {
      cohorts: false,
      lifecycle: false,
      stickiness: false,
      api_export: false,
      ai_insights: false,
    },
  };
}

function planToFormValues(plan: AdminPlan): PlanFormValues {
  return {
    name: plan.name,
    slug: plan.slug,
    events_limit: plan.events_limit !== null && plan.events_limit !== undefined ? String(plan.events_limit) : '',
    data_retention_days:
      plan.data_retention_days !== null && plan.data_retention_days !== undefined
        ? String(plan.data_retention_days)
        : '',
    max_projects: plan.max_projects !== null && plan.max_projects !== undefined ? String(plan.max_projects) : '',
    ai_messages_per_month:
      plan.ai_messages_per_month !== null && plan.ai_messages_per_month !== undefined
        ? String(plan.ai_messages_per_month)
        : '',
    is_public: plan.is_public,
    features: { ...plan.features },
  };
}

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') {return null;}
  const parsed = parseInt(trimmed, 10);
  return isNaN(parsed) ? null : parsed;
}

// ---------------------------------------------------------------------------
// Plan Dialog
// ---------------------------------------------------------------------------

interface PlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan?: AdminPlan; // if provided → edit mode
  onSuccess: () => void;
}

function PlanDialog({ open, onOpenChange, plan, onSuccess }: PlanDialogProps) {
  const { t } = useLocalTranslation(translations);
  const isEdit = !!plan;

  const [values, setValues] = useState<PlanFormValues>(() =>
    plan ? planToFormValues(plan) : defaultFormValues(),
  );

  // Reset form when dialog opens
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setValues(plan ? planToFormValues(plan) : defaultFormValues());
      }
      onOpenChange(nextOpen);
    },
    [plan, onOpenChange],
  );

  const createMutation = useMutation({
    mutationFn: (data: CreateAdminPlan) => api.adminPlansControllerCreatePlan(data),
    onSuccess: () => {
      toast.success(t('createSuccess'));
      onOpenChange(false);
      onSuccess();
    },
    onError: () => toast.error(t('createError')),
  });

  const updateMutation = useMutation({
    mutationFn: (data: PatchAdminPlan) =>
      api.adminPlansControllerPatchPlan({ id: plan!.id }, data),
    onSuccess: () => {
      toast.success(t('updateSuccess'));
      onOpenChange(false);
      onSuccess();
    },
    onError: () => toast.error(t('updateError')),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isEdit) {
        const payload: PatchAdminPlan = {
          name: values.name,
          events_limit: parseOptionalInt(values.events_limit),
          data_retention_days: parseOptionalInt(values.data_retention_days),
          max_projects: parseOptionalInt(values.max_projects),
          ai_messages_per_month: parseOptionalInt(values.ai_messages_per_month),
          is_public: values.is_public,
          features: values.features,
        };
        updateMutation.mutate(payload);
      } else {
        const payload: CreateAdminPlan = {
          name: values.name,
          slug: values.slug,
          events_limit: parseOptionalInt(values.events_limit),
          data_retention_days: parseOptionalInt(values.data_retention_days),
          max_projects: parseOptionalInt(values.max_projects),
          ai_messages_per_month: parseOptionalInt(values.ai_messages_per_month),
          is_public: values.is_public,
          features: values.features,
        };
        createMutation.mutate(payload);
      }
    },
    [isEdit, values, createMutation, updateMutation],
  );

  const toggleFeature = useCallback((key: keyof CreatePlanFeatures) => {
    setValues((prev) => ({
      ...prev,
      features: { ...prev.features, [key]: !prev.features[key] },
    }));
  }, []);

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

          {/* Slug — only shown on create */}
          {!isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="plan-slug">{t('slug')}</Label>
              <Input
                id="plan-slug"
                value={values.slug}
                onChange={(e) => setValues((v) => ({ ...v, slug: e.target.value }))}
                placeholder={t('slugPlaceholder')}
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

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminPlansPage() {
  const { t } = useLocalTranslation(translations);
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<AdminPlan | null>(null);
  const confirmDelete = useConfirmDelete();

  const { data: plans, isLoading } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => api.adminPlansControllerListPlans(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.adminPlansControllerDeletePlan({ id }),
    onSuccess: () => {
      toast.success(t('deleteSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
      confirmDelete.close();
    },
    onError: (error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        toast.error(t('deleteConflict'));
      } else {
        toast.error(t('deleteError'));
      }
      confirmDelete.close();
    },
  });

  const handleDeleteConfirm = useCallback(async () => {
    await deleteMutation.mutateAsync(confirmDelete.itemId);
  }, [confirmDelete.itemId, deleteMutation]);

  const handleSuccess = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
  }, [queryClient]);

  const columns: Column<AdminPlan>[] = [
    {
      key: 'name',
      header: t('name'),
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: 'slug',
      header: t('slug'),
      render: (row) => (
        <span className="text-muted-foreground font-mono text-xs">{row.slug}</span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'events_limit',
      header: t('eventsLimit'),
      render: (row) => (
        <span className="text-sm">{formatLimit(row.events_limit, t('unlimited'))}</span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'data_retention_days',
      header: t('dataRetentionDays'),
      render: (row) => (
        <span className="text-sm">{formatLimit(row.data_retention_days, t('unlimited'))}</span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'max_projects',
      header: t('maxProjects'),
      render: (row) => (
        <span className="text-sm">{formatLimit(row.max_projects, t('unlimited'))}</span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'is_public',
      header: t('isPublic'),
      render: (row) =>
        row.is_public ? (
          <Badge variant="default">{t('yes')}</Badge>
        ) : (
          <Badge variant="secondary">{t('no')}</Badge>
        ),
    },
    {
      key: 'features',
      header: t('features'),
      render: (row) => {
        const enabled = FEATURE_KEYS.filter((k) => row.features[k]);
        if (enabled.length === 0) {return <span className="text-muted-foreground text-xs">—</span>;}
        return (
          <div className="flex flex-wrap gap-1">
            {enabled.map((k) => (
              <Badge key={k} variant="outline" className="text-xs">
                {k}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: t('actions'),
      render: (row) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setEditPlan(row)}
            title={t('edit')}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => confirmDelete.requestDelete(row.id, row.name)}
            title={t('delete')}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')}>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('newPlan')}
        </Button>
      </PageHeader>

      {isLoading && <ListSkeleton count={4} />}

      {!isLoading && plans?.length === 0 && (
        <EmptyState
          icon={CreditCard}
          title={t('noPlans')}
          description={t('noPlansDescription')}
        />
      )}

      {!isLoading && plans && plans.length > 0 && (
        <DataTable columns={columns} data={plans} rowKey={(row) => row.id} />
      )}

      {/* Create dialog */}
      <PlanDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleSuccess}
      />

      {/* Edit dialog */}
      {editPlan && (
        <PlanDialog
          open={!!editPlan}
          onOpenChange={(open) => { if (!open) {setEditPlan(null);} }}
          plan={editPlan}
          onSuccess={handleSuccess}
        />
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={confirmDelete.isOpen}
        onOpenChange={confirmDelete.close}
        title={t('deleteTitle')}
        description={t('deleteDescription', { name: confirmDelete.itemName })}
        confirmLabel={t('deleteConfirm')}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
