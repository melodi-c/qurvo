import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { UsersRound, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EditorHeader } from '@/components/ui/editor-header';
import { CohortConditionBuilder, type CohortCondition } from '@/features/cohorts/components/CohortConditionBuilder';
import { useCohort, useCreateCohort, useUpdateCohort, useCohortPreviewCount } from '@/features/cohorts/hooks/use-cohorts';
import { useDebounce } from '@/hooks/use-debounce';
import { toast } from 'sonner';
import type { CohortDefinition } from '@/api/generated/Api';

export default function CohortEditorPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const navigate = useNavigate();
  const isNew = !cohortId || cohortId === 'new';

  const { data: existingCohort, isLoading: loadingCohort } = useCohort(isNew ? '' : cohortId!);
  const createMutation = useCreateCohort();
  const updateMutation = useUpdateCohort();
  const previewMutation = useCohortPreviewCount();

  const [name, setName] = useState('Untitled cohort');
  const [description, setDescription] = useState('');
  const [match, setMatch] = useState<'all' | 'any'>('all');
  const [conditions, setConditions] = useState<CohortCondition[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load existing cohort data
  useEffect(() => {
    if (existingCohort && !initialized) {
      setName(existingCohort.name);
      setDescription(existingCohort.description ?? '');
      const def = existingCohort.definition as unknown as { match: 'all' | 'any'; conditions: CohortCondition[] };
      setMatch(def.match);
      setConditions(def.conditions);
      setInitialized(true);
    }
  }, [existingCohort, initialized]);

  // Debounced preview count
  const definition: CohortDefinition = { match, conditions: conditions as any };
  const definitionHash = JSON.stringify(definition);
  const debouncedHash = useDebounce(definitionHash, 800);
  const hasValidConditions = conditions.length > 0 && conditions.every((c) => {
    if (c.type === 'person_property') return c.property.trim() !== '';
    if (c.type === 'event') return c.event_name.trim() !== '';
    return false;
  });

  useEffect(() => {
    if (!projectId || !hasValidConditions) return;
    const def = JSON.parse(debouncedHash) as CohortDefinition;
    previewMutation.mutate(def);
  }, [debouncedHash, projectId, hasValidConditions]);

  const listPath = `/cohorts?project=${projectId}`;
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isValid = name.trim() !== '' && conditions.length > 0;

  const handleSave = useCallback(async () => {
    if (!isValid || isSaving) return;
    setSaveError(null);

    try {
      if (isNew) {
        await createMutation.mutateAsync({
          name: name.trim(),
          description: description.trim() || undefined,
          definition: { match, conditions: conditions as any },
        });
        toast.success('Cohort created');
      } else {
        await updateMutation.mutateAsync({
          cohortId: cohortId!,
          data: {
            name: name.trim(),
            description: description.trim() || undefined,
            definition: { match, conditions: conditions as any },
          },
        });
        toast.success('Cohort updated');
      }
      navigate(listPath);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
    }
  }, [name, description, match, conditions, isNew, cohortId, isValid, isSaving, listPath, navigate, createMutation, updateMutation]);

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
    <div className="-m-6 h-full flex flex-col overflow-hidden">
      <EditorHeader
        backPath={listPath}
        backLabel="Cohorts"
        name={name}
        onNameChange={setName}
        placeholder="Untitled cohort"
        onSave={handleSave}
        isSaving={isSaving}
        isValid={isValid}
        saveError={saveError}
      />

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel: Editor */}
        <aside className="w-[420px] flex-shrink-0 border-r border-border overflow-y-auto">
          <div className="p-5 space-y-5">
            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="h-8 text-sm"
              />
            </div>

            {/* Separator */}
            <div className="border-t border-border" />

            {/* Conditions */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Conditions</label>
              <CohortConditionBuilder
                match={match}
                conditions={conditions}
                onMatchChange={setMatch}
                onConditionsChange={setConditions}
              />
            </div>
          </div>
        </aside>

        {/* Right panel: Preview */}
        <main className="flex-1 overflow-auto flex flex-col items-center justify-center">
          <div className="text-center space-y-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto">
              <UsersRound className="h-8 w-8 text-muted-foreground" />
            </div>
            {!hasValidConditions ? (
              <div>
                <p className="text-sm font-medium">Add conditions to preview</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Configure conditions on the left to see matching users count
                </p>
              </div>
            ) : previewMutation.isPending ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Calculating...</span>
              </div>
            ) : previewMutation.data ? (
              <div>
                <p className="text-4xl font-bold tabular-nums text-primary">
                  {previewMutation.data.count.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground mt-1">persons match</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium">Preview will appear here</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
