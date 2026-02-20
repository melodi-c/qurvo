import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useInsight, useCreateInsight, useUpdateInsight } from './use-insights';
import type { InsightDtoTypeEnum } from '@/api/generated/Api';

interface UseInsightEditorOptions<T> {
  type: InsightDtoTypeEnum;
  basePath: string;
  defaultName: string;
  defaultConfig: () => T;
  cleanConfig: (config: T) => T;
}

export function useInsightEditor<T>({
  type,
  basePath,
  defaultName,
  defaultConfig,
  cleanConfig,
}: UseInsightEditorOptions<T>) {
  const { insightId } = useParams<{ insightId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

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

  const listPath = `${basePath}?project=${projectId}`;

  const handleSave = useCallback(async () => {
    if (!name.trim() || isSaving) return;
    setSaveError(null);

    try {
      if (isNew) {
        await createMutation.mutateAsync({
          type,
          name,
          config: cleanConfig(config) as any,
        });
      } else {
        await updateMutation.mutateAsync({
          insightId: insightId!,
          data: { name, config: cleanConfig(config) as any },
        });
      }
      navigate(listPath);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
    }
  }, [name, config, isNew, insightId, isSaving, type, listPath, navigate, createMutation, updateMutation, cleanConfig]);

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
