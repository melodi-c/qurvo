import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useCohort, useCreateCohort, useUpdateCohort, useCohortPreviewQuery, useCohortMemberCount, useCohortSizeHistory } from '@/features/cohorts/hooks/use-cohorts';
import { useDebouncedHash } from '@/hooks/use-debounced-hash';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useProjectRole } from '@/hooks/use-project-role';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { isConditionValid, isGroup, createEmptyGroup, type CohortConditionGroup, type CohortCondition } from '@/features/cohorts/types';
import { stripClientKeys } from '@/features/cohorts/utils/strip-client-keys';
import translations from './use-cohort-editor.translations';

export function useCohortEditor() {
  const { t } = useLocalTranslation(translations);
  const { cohortId } = useParams<{ cohortId: string }>();
  const { go, link, projectId } = useAppNavigate();
  const isNew = !cohortId || cohortId === 'new';

  const { data: existingCohort, isLoading: loadingCohort, isError: errorCohort, refetch: refetchCohort } = useCohort(isNew ? '' : cohortId);
  const createMutation = useCreateCohort();
  const updateMutation = useUpdateCohort();

  const { data: memberCount } = useCohortMemberCount(isNew ? '' : cohortId);
  const { data: sizeHistory } = useCohortSizeHistory(isNew ? '' : cohortId);

  const [name, setName] = useState(t('defaultName'));
  const [description, setDescription] = useState('');
  const [groups, setGroups] = useState<CohortConditionGroup[]>([createEmptyGroup()]);
  const initialized = useRef(isNew);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Track initial state for isDirty computation
  const initialState = useRef({
    name: t('defaultName'),
    description: '',
    groups: JSON.stringify([createEmptyGroup()]),
  });

  useEffect(() => {
    if (!initialized.current && existingCohort) {
      setName(existingCohort.name);
      setDescription(existingCohort.description ?? '');
      const rootGroup = existingCohort.definition as CohortConditionGroup;
      let parsedGroups: CohortConditionGroup[];
      if (rootGroup.type === 'AND') {
        parsedGroups = [rootGroup];
      } else {
        const andGroups = rootGroup.values.map((v) => {
          if (isGroup(v)) {return v;}
          return { type: 'AND' as const, values: [v] };
        });
        parsedGroups = andGroups.length > 0 ? andGroups : [createEmptyGroup()];
      }
      setGroups(parsedGroups);
      initialState.current = {
        name: existingCohort.name,
        description: existingCohort.description ?? '',
        groups: JSON.stringify(parsedGroups),
      };
      initialized.current = true;
    }
  }, [existingCohort]);

  const isDirty = useMemo(() => {
    const initial = initialState.current;
    if (name !== initial.name) {return true;}
    if (description !== initial.description) {return true;}
    return JSON.stringify(groups) !== initial.groups;
  }, [name, description, groups]);

  const unsavedGuard = useUnsavedChangesGuard(isDirty);

  const definition = useMemo((): CohortConditionGroup => {
    if (groups.length === 1) {return groups[0];}
    return { type: 'OR', values: groups };
  }, [groups]);

  const role = useProjectRole();
  const canPreview = role === 'owner' || role === 'editor';

  const { debounced: debouncedDefinition, hash: debouncedHash } = useDebouncedHash(definition, 800);

  const hasValidConditions = useMemo(() => {
    const allConditions = groups.flatMap((g) => g.values as CohortCondition[]);
    return allConditions.length > 0 && allConditions.every(isConditionValid);
  }, [groups]);

  const previewQuery = useCohortPreviewQuery(
    debouncedDefinition,
    debouncedHash,
    !!projectId && hasValidConditions && canPreview,
  );

  const listPath = link.cohorts.list();
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isValid = name.trim() !== '' && hasValidConditions;

  const handleSave = useCallback(async () => {
    if (!isValid || isSaving) {return;}
    setSaveError(null);

    try {
      const cleanDefinition = stripClientKeys(definition);
      if (isNew) {
        await createMutation.mutateAsync({
          name: name.trim(),
          description: description.trim() || undefined,
          definition: cleanDefinition,
        });
        toast.success(t('cohortCreated'));
      } else {
        await updateMutation.mutateAsync({
          cohortId: cohortId,
          data: {
            name: name.trim(),
            description: description.trim() || undefined,
            definition: cleanDefinition,
          },
        });
        toast.success(t('cohortUpdated'));
      }
      // Mark current state as clean before navigating away
      initialState.current = { name, description, groups: JSON.stringify(groups) };
      unsavedGuard.markClean();
      void go.cohorts.list();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t('saveFailed'));
    }
  }, [name, description, definition, groups, isNew, cohortId, isValid, isSaving, go, createMutation, updateMutation, t, unsavedGuard]);

  return {
    isNew,
    cohortId,
    loadingCohort,
    errorCohort,
    refetchCohort,
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
    canPreview,
    previewQuery,
    listPath,
    isSaving,
    isValid,
    saveError,
    handleSave,
    isDirty,
    unsavedGuard,
  };
}
