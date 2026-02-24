import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { UsersRound, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EditorHeader } from '@/components/ui/editor-header';
import { CohortGroupBuilder } from '@/features/cohorts/components/CohortGroupBuilder';
import { useCohort, useCreateCohort, useUpdateCohort, useCohortPreviewCount, useCohortMemberCount, useCohortSizeHistory } from '@/features/cohorts/hooks/use-cohorts';
import { CohortSizeChart } from '@/features/cohorts/components/CohortSizeChart';
import { useDebounce } from '@/hooks/use-debounce';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './cohort-editor.translations';
import { toast } from 'sonner';
import { isConditionValid, isGroup, createEmptyGroup, type CohortConditionGroup, type CohortCondition } from '@/features/cohorts/types';

export default function CohortEditorPage() {
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

  // Load existing cohort data
  useEffect(() => {
    if (!initialized.current && existingCohort) {
      setName(existingCohort.name);
      setDescription(existingCohort.description ?? '');
      const rootGroup = existingCohort.definition as CohortConditionGroup;
      // Top-level is OR of AND groups. If the root is AND, wrap it in an array of one group.
      if (rootGroup.type === 'AND') {
        setGroups([rootGroup]);
      } else {
        // OR at top: each value is an AND group
        const andGroups = rootGroup.values.map((v) => {
          if (isGroup(v)) return v;
          // Single condition: wrap in AND group
          return { type: 'AND' as const, values: [v] };
        });
        setGroups(andGroups.length > 0 ? andGroups : [createEmptyGroup()]);
      }
      initialized.current = true;
    }
  }, [existingCohort]);

  // Build V2 definition from groups
  const definition = useMemo((): CohortConditionGroup => {
    if (groups.length === 1) return groups[0];
    return { type: 'OR', values: groups };
  }, [groups]);

  // Debounced preview count
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

  if (!isNew && loadingCohort) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="-m-4 lg:-m-6 flex flex-col lg:h-full lg:overflow-hidden">
      <EditorHeader
        backPath={listPath}
        backLabel={t('backLabel')}
        name={name}
        onNameChange={setName}
        placeholder={t('placeholder')}
        onSave={handleSave}
        isSaving={isSaving}
        isValid={isValid}
        saveError={saveError}
      />

      {/* Body */}
      <div className="flex flex-col lg:flex-row flex-1 lg:min-h-0">
        {/* Left panel: Editor */}
        <aside className="w-full lg:w-[420px] shrink-0 border-b border-border lg:border-b-0 lg:border-r overflow-y-auto max-h-[55vh] lg:max-h-none">
          <div className="p-5 space-y-5">
            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('descriptionLabel')}</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('descriptionPlaceholder')}
                className="h-8 text-sm"
              />
            </div>

            {/* Separator */}
            <div className="border-t border-border" />

            {/* Conditions */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('conditionsLabel')}</label>
              <CohortGroupBuilder
                groups={groups}
                onChange={setGroups}
                excludeCohortId={cohortId}
              />
            </div>
          </div>
        </aside>

        {/* Right panel */}
        {!isNew && existingCohort ? (
          <main className="flex-1 overflow-auto flex flex-col">
            <div className="border-b px-6 py-6 text-center">
              <p className="text-4xl font-bold tabular-nums text-primary">
                {memberCount ? memberCount.count.toLocaleString() : '—'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">{t('currentMembers')}</p>
            </div>
            <div className="flex-1 p-6 space-y-3">
              <p className="text-sm font-medium">{t('sizeHistory')}</p>
              <CohortSizeChart data={sizeHistory ?? []} />
            </div>
            {existingCohort.last_error_message && (
              <div className="border-t px-6 py-4">
                <p className="text-sm text-destructive font-medium">{t('calculationError')}</p>
                <p className="text-xs text-muted-foreground mt-1">{existingCohort.last_error_message}</p>
              </div>
            )}
          </main>
        ) : (
          <main className="flex-1 overflow-auto flex flex-col items-center justify-center">
            <div className="text-center space-y-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto">
                <UsersRound className="h-8 w-8 text-muted-foreground" />
              </div>
              {!hasValidConditions ? (
                <div>
                  <p className="text-sm font-medium">{t('addConditionsTitle')}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('addConditionsDescription')}
                  </p>
                </div>
              ) : previewMutation.isPending ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">{t('calculating')}</span>
                </div>
              ) : previewMutation.data ? (
                <div>
                  <p className="text-4xl font-bold tabular-nums text-primary">
                    {previewMutation.data.count.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">{t('personsMatch')}</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium">{t('previewPlaceholder')}</p>
                </div>
              )}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
