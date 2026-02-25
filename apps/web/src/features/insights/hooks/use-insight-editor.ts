import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useInsight, useCreateInsight, useUpdateInsight } from './use-insights';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import type { InsightType, CreateInsight } from '@/api/generated/Api';

interface UseInsightEditorOptions<T extends CreateInsight['config']> {
  type: InsightType;
  defaultName: string;
  defaultConfig: () => T;
  cleanConfig?: (config: T) => T;
}

export function useInsightEditor<T extends CreateInsight['config']>({
  type,
  defaultName,
  defaultConfig,
  cleanConfig,
}: UseInsightEditorOptions<T>) {
  const cleanFn = useMemo(() => cleanConfig ?? ((c: T) => c), [cleanConfig]);
  const { insightId } = useParams<{ insightId: string }>();
  const { go, link, projectId } = useAppNavigate();

  const isNew = !insightId;
  const { data: insight } = useInsight(insightId ?? '');

  const [name, setName] = useState(defaultName);
  const [config, setConfig] = useState<T>(defaultConfig);
  const initialized = useRef(isNew);

  useEffect(() => {
    if (!initialized.current && insight) {
      setName(insight.name);
      setConfig(insight.config as T);
      initialized.current = true;
    }
  }, [insight]);

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
        await createMutation.mutateAsync({ type, name, config: config_ });
      } else {
        await updateMutation.mutateAsync({
          insightId: insightId!,
          data: { name, config: config_ },
        });
      }
      go.insights.list();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
    }
  }, [name, config, isNew, insightId, isSaving, type, go, createMutation, updateMutation, cleanFn]);

  return {
    name,
    setName,
    config,
    setConfig,
    isNew,
    isSaving,
    saveError,
    listPath,
    handleSave,
    insightId,
    projectId,
  };
}
