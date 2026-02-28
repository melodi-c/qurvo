import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useInsight, useCreateInsight, useUpdateInsight } from './use-insights';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import type { InsightType, CreateInsight } from '@/api/generated/Api';

interface UseInsightEditorOptions<T extends CreateInsight['config']> {
  type: InsightType;
  defaultName: string;
  defaultConfig: () => T;
  cleanConfig?: (config: T) => T;
  isConfigValid?: (config: T) => boolean;
}

export function useInsightEditor<T extends CreateInsight['config']>({
  type,
  defaultName,
  defaultConfig,
  cleanConfig,
  isConfigValid: isConfigValidFn,
}: UseInsightEditorOptions<T>) {
  const identityFn = useRef((c: T) => c);
  const cleanFn = cleanConfig ?? identityFn.current;
  const { insightId } = useParams<{ insightId: string }>();
  const { go, link, projectId } = useAppNavigate();

  const isNew = !insightId;
  const { data: insight } = useInsight(insightId ?? '');

  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState<T>(defaultConfig);
  const initialized = useRef(isNew);

  // Track initial state for isDirty computation
  const initialState = useRef({ name: defaultName, description: '', config: defaultConfig() });

  useEffect(() => {
    if (!initialized.current && insight) {
      setName(insight.name);
      setDescription(insight.description ?? '');
      setConfig(insight.config as T);
      initialState.current = {
        name: insight.name,
        description: insight.description ?? '',
        config: insight.config as T,
      };
      initialized.current = true;
    }
  }, [insight]);

  const isDirty = useMemo(() => {
    const initial = initialState.current;
    if (name !== initial.name) return true;
    if (description !== initial.description) return true;
    return JSON.stringify(config) !== JSON.stringify(initial.config);
  }, [name, description, config]);

  const unsavedGuard = useUnsavedChangesGuard(isDirty);

  const createMutation = useCreateInsight();
  const updateMutation = useUpdateInsight();
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const [saveError, setSaveError] = useState<string | null>(null);

  const listPath = link.insights.list();

  const handleSave = useCallback(async () => {
    if (!name.trim() || isSaving) return;
    setSaveError(null);

    try {
      const config_ = cleanFn(config);
      if (isNew) {
        await createMutation.mutateAsync({ type, name, description: description || undefined, config: config_ });
      } else {
        await updateMutation.mutateAsync({
          insightId: insightId!,
          data: { name, description: description || undefined, config: config_ },
        });
      }
      // Mark current state as clean before navigating away
      initialState.current = { name, description, config };
      go.insights.list();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
    }
  }, [name, description, config, isNew, insightId, isSaving, type, go, createMutation, updateMutation, cleanFn]);

  const previewId = isNew ? `${type}-new` : insightId!;
  const isConfigValid = isConfigValidFn ? isConfigValidFn(config) : true;
  const isValid = name.trim() !== '' && isConfigValid;
  const showSkeleton = (loading: boolean, data: unknown) => loading && !data;

  return {
    name,
    setName,
    description,
    setDescription,
    config,
    setConfig,
    isNew,
    isSaving,
    saveError,
    listPath,
    handleSave,
    insightId,
    projectId,
    previewId,
    isConfigValid,
    isValid,
    showSkeleton,
    isDirty,
    unsavedGuard,
  };
}
