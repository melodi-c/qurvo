import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useCohort, useCreateCohort, useUpdateCohort, useCohortPreviewCount, useCohortMemberCount, useCohortSizeHistory } from '@/features/cohorts/hooks/use-cohorts';
import { useDebounce } from '@/hooks/use-debounce';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { isConditionValid, isGroup, createEmptyGroup, type CohortConditionGroup, type CohortCondition } from '@/features/cohorts/types';
import translations from './cohort-editor.translations';

export function useCohortEditor() {
  const { t } = useLocalTranslation(translations);
  const { cohortId } = useParams<{ cohortId: string }>();
  const { go, link, projectId } = useAppNavigate();
  const isNew = !cohortId || cohortId === 'new';

  const { data: existingCohort, isLoading: loadingCohort } = useCohort(isNew ? '' : cohortId!);
  const createMutation = useCreateCohort();
  const updateMutation = useUpdateCohort();
  const previewMutation = useCohortPreviewCount();

  const { data: memberCount } = useCohortMemberCount(isNew ? '' : cohortId!);
  const { data: sizeHistory } = useCohortSizeHistory(isNew ? '' : cohortId!);

  const [name, setName] = useState(t('defaultName'));
  const [description, setDescription] = useState('');
  const [groups, setGroups] = useState<CohortConditionGroup[]>([createEmptyGroup()]);
  const initialized = useRef(isNew);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialized.current && existingCohort) {
      setName(existingCohort.name);
      setDescription(existingCohort.description ?? '');
      const rootGroup = existingCohort.definition as CohortConditionGroup;
      if (rootGroup.type === 'AND') {
        setGroups([rootGroup]);
      } else {
        const andGroups = rootGroup.values.map((v) => {
          if (isGroup(v)) return v;
          return { type: 'AND' as const, values: [v] };
        });
        setGroups(andGroups.length > 0 ? andGroups : [createEmptyGroup()]);
      }
      initialized.current = true;
    }
  }, [existingCohort]);

  const definition = useMemo((): CohortConditionGroup => {
    if (groups.length === 1) return groups[0];
    return { type: 'OR', values: groups };
  }, [groups]);

  const definitionHash = JSON.stringify(definition);
  const debouncedHash = useDebounce(definitionHash, 800);

  const hasValidConditions = useMemo(() => {
    const allConditions = groups.flatMap((g) => g.values as CohortCondition[]);
    return allConditions.length > 0 && allConditions.every(isConditionValid);
  }, [groups]);

  useEffect(() => {
    if (!projectId || !hasValidConditions) return;
    previewMutation.mutate({ definition });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedHash, projectId, hasValidConditions]);

  const listPath = link.cohorts.list();
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const allConditions = groups.flatMap((g) => g.values);
  const isValid = name.trim() !== '' && allConditions.length > 0;

  const handleSave = useCallback(async () => {
    if (!isValid || isSaving) return;
    setSaveError(null);

    try {
      if (isNew) {
        await createMutation.mutateAsync({
          name: name.trim(),
          description: description.trim() || undefined,
          definition,
        });
        toast.success(t('cohortCreated'));
      } else {
        await updateMutation.mutateAsync({
          cohortId: cohortId!,
          data: {
            name: name.trim(),
            description: description.trim() || undefined,
            definition,
          },
        });
        toast.success(t('cohortUpdated'));
      }
      go.cohorts.list();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t('saveFailed'));
    }
  }, [name, description, definition, isNew, cohortId, isValid, isSaving, go, createMutation, updateMutation, t]);

  return {
    isNew,
    cohortId,
    loadingCohort,
    existingCohort,
    memberCount,
    sizeHistory,
    name,
    setName,
    description,
    setDescription,
    groups,
    setGroups,
    hasValidConditions,
    previewMutation,
    listPath,
    isSaving,
    isValid,
    saveError,
    handleSave,
  };
}
