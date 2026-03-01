import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { api } from '@/api/client';
import type { AdminPlan, CreateAdminPlan, PatchAdminPlan, CreatePlanFeatures } from '@/api/generated/Api';
import translations from './admin-plans-page.translations';

export interface PlanFormValues {
  name: string;
  slug: string;
  events_limit: string;
  data_retention_days: string;
  max_projects: string;
  ai_messages_per_month: string;
  is_public: boolean;
  features: CreatePlanFeatures;
}

export function defaultFormValues(): PlanFormValues {
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

export function planToFormValues(plan: AdminPlan): PlanFormValues {
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

export function usePlanForm(plan: AdminPlan | undefined, onOpenChange: (open: boolean) => void, onSuccess: () => void) {
  const { t } = useLocalTranslation(translations);
  const isEdit = !!plan;

  const [values, setValues] = useState<PlanFormValues>(() =>
    plan ? planToFormValues(plan) : defaultFormValues(),
  );

  const resetValues = useCallback(
    (nextPlan?: AdminPlan) => {
      setValues(nextPlan ? planToFormValues(nextPlan) : defaultFormValues());
    },
    [],
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

  return {
    values,
    setValues,
    resetValues,
    isEdit,
    isPending,
    handleSubmit,
    toggleFeature,
  };
}
