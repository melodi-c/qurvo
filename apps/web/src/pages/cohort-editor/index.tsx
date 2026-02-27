import { useMemo, useState } from 'react';
import { UsersRound, Loader2, AlertTriangle, Copy, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { EditorHeader } from '@/components/ui/editor-header';
import { QueryPanelShell } from '@/components/ui/query-panel-shell';
import { TabNav } from '@/components/ui/tab-nav';
import { CohortGroupBuilder } from '@/features/cohorts/components/CohortGroupBuilder';
import { CohortSizeChart } from '@/features/cohorts/components/CohortSizeChart';
import { MembersTab } from '@/features/cohorts/components/MembersTab';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useUrlTab } from '@/hooks/use-url-tab';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useDuplicateAsStatic } from '@/features/cohorts/hooks/use-cohorts';
import { cn, extractApiErrorMessage } from '@/lib/utils';
import translations from './cohort-editor.translations';
import { useCohortEditor } from '@/features/cohorts/hooks/use-cohort-editor';

type TabId = 'overview' | 'members';

export default function CohortEditorPage() {
  const { t } = useLocalTranslation(translations);
  const [urlTab, setTab] = useUrlTab<TabId>('overview', ['overview', 'members']);
  const { go } = useAppNavigate();
  const duplicateMutation = useDuplicateAsStatic();
  const [panelOpen, setPanelOpen] = useState(false);

  const {
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
    previewMutation,
    listPath,
    isSaving,
    isValid,
    saveError,
    handleSave,
  } = useCohortEditor();

  const handleDuplicateAsStatic = async () => {
    if (!cohortId) return;
    try {
      const newCohort = await duplicateMutation.mutateAsync(cohortId);
      toast.success(t('duplicated'));
      go.cohorts.detail(newCohort.id);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, t('duplicateFailed')));
    }
  };

  const showTabs = !isNew && existingCohort?.is_static === true;
  const activeTab = showTabs ? urlTab : 'overview';

  const tabs = useMemo(() => [
    { id: 'overview' as const, label: t('overviewTab') },
    { id: 'members' as const, label: t('membersTab') },
  ], [t]);

  if (!isNew && loadingCohort) {
    return (
      <div className="-m-4 lg:-m-6 flex flex-col lg:h-full lg:overflow-hidden">
        <div className="h-[var(--topbar-height)] border-b border-border shrink-0" />
        <div className="flex flex-col lg:flex-row flex-1 lg:min-h-0">
          <QueryPanelShell>
            <div className="space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          </QueryPanelShell>
          <main className="flex-1 flex items-center justify-center">
            <Skeleton className="h-32 w-48" />
          </main>
        </div>
      </div>
    );
  }

  if (!isNew && errorCohort) {
    return (
      <div className="-m-4 lg:-m-6 flex flex-col lg:h-full lg:overflow-hidden">
        <div className="h-[var(--topbar-height)] border-b border-border shrink-0" />
        <main className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={AlertTriangle}
            description={t('errorLoading')}
            action={
              <Button variant="outline" onClick={() => refetchCohort()}>
                {t('retry')}
              </Button>
            }
          />
        </main>
      </div>
    );
  }

  let previewContent: React.ReactNode;
  if (!canPreview) {
    previewContent = (
      <EmptyState
        icon={UsersRound}
        description={t('viewerNoPreview')}
      />
    );
  } else if (!hasValidConditions) {
    previewContent = (
      <div className="text-center space-y-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto">
          <UsersRound className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">{t('addConditionsTitle')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('addConditionsDescription')}</p>
        </div>
      </div>
    );
  } else if (previewMutation.isPending) {
    previewContent = (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">{t('calculating')}</span>
      </div>
    );
  } else if (previewMutation.isError) {
    previewContent = (
      <EmptyState
        icon={AlertTriangle}
        description={t('previewError')}
      />
    );
  } else if (previewMutation.data) {
    previewContent = (
      <div className="text-center">
        <p className="text-4xl font-bold tabular-nums text-primary">
          {previewMutation.data.count.toLocaleString()}
        </p>
        <p className="text-sm text-muted-foreground mt-1">{t('personsMatch')}</p>
      </div>
    );
  } else {
    previewContent = (
      <EmptyState
        icon={UsersRound}
        description={t('previewPlaceholder')}
      />
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

      <div className="lg:hidden border-b border-border px-4 py-2 flex items-center">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground gap-1.5"
          onClick={() => setPanelOpen((prev) => !prev)}
        >
          {panelOpen ? (
            <>
              <X className="h-4 w-4" />
              {t('hideSettings')}
            </>
          ) : (
            <>
              <SlidersHorizontal className="h-4 w-4" />
              {t('settings')}
            </>
          )}
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 lg:min-h-0">
        <div className={cn(panelOpen ? 'block' : 'hidden', 'lg:contents')}>
        <QueryPanelShell>
          <div className="space-y-1.5">
            <Label htmlFor="cohort-description" className="text-xs font-medium text-muted-foreground">{t('descriptionLabel')}</Label>
            <Input
              id="cohort-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              className="h-8 text-sm"
            />
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{t('conditionsLabel')}</Label>
            <CohortGroupBuilder
              groups={groups}
              onChange={setGroups}
              excludeCohortId={cohortId}
            />
          </div>
        </QueryPanelShell>
        </div>

        {!isNew && existingCohort ? (
          <main className="flex-1 overflow-auto flex flex-col">
            {showTabs && (
              <TabNav
                tabs={tabs}
                value={activeTab}
                onChange={setTab}
                className="px-6 shrink-0"
              />
            )}

            {activeTab === 'overview' && (
              <>
                <div className="border-b px-6 py-6 text-center">
                  {canPreview && previewMutation.isPending ? (
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">{t('calculating')}</span>
                    </div>
                  ) : canPreview && previewMutation.data ? (
                    <>
                      <p className="text-4xl font-bold tabular-nums text-primary">
                        {previewMutation.data.count.toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">{t('personsMatch')}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-4xl font-bold tabular-nums text-primary">
                        {memberCount ? memberCount.count.toLocaleString() : '\u2014'}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">{t('currentMembers')}</p>
                    </>
                  )}
                </div>
                <div className="flex-1 p-6 space-y-3">
                  <p className="text-sm font-medium">{t('sizeHistory')}</p>
                  <CohortSizeChart data={sizeHistory ?? []} />
                </div>
                {!existingCohort.is_static && (
                  <div className="border-t px-6 py-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{t('duplicateAsStatic')}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t('duplicateAsStaticDesc')}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDuplicateAsStatic}
                      disabled={duplicateMutation.isPending}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {duplicateMutation.isPending ? t('duplicating') : t('duplicateAsStatic')}
                    </Button>
                  </div>
                )}
                {existingCohort.last_error_message && (
                  <div className="border-t px-6 py-4">
                    <p className="text-sm text-destructive font-medium">{t('calculationError')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{existingCohort.last_error_message}</p>
                  </div>
                )}
              </>
            )}

            {activeTab === 'members' && showTabs && cohortId && (
              <MembersTab
                cohortId={cohortId}
                memberCount={memberCount?.count ?? 0}
              />
            )}
          </main>
        ) : (
          <main className="flex-1 overflow-auto flex flex-col items-center justify-center">
            {previewContent}
          </main>
        )}
      </div>
    </div>
  );
}
