import { useMemo } from 'react';
import { AlertTriangle, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { EditorHeader } from '@/components/ui/editor-header';
import { QueryPanelShell } from '@/components/ui/query-panel-shell';
import { TabNav } from '@/components/ui/tab-nav';
import { CohortPreviewCount } from '@/components/CohortPreviewCount';
import { MobileQueryPanelToggle } from '@/components/MobileQueryPanelToggle';
import { CohortGroupBuilder } from '@/features/cohorts/components/CohortGroupBuilder';
import { CohortSizeChart } from '@/features/cohorts/components/CohortSizeChart';
import { MembersTab } from '@/features/cohorts/components/MembersTab';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useUrlTab } from '@/hooks/use-url-tab';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useDuplicateAsStatic } from '@/features/cohorts/hooks/use-cohorts';
import { extractApiErrorMessage } from '@/lib/utils';

import translations from './cohort-editor.translations';
import guardTranslations from '@/hooks/use-unsaved-changes-guard.translations';
import { useCohortEditor } from '@/features/cohorts/hooks/use-cohort-editor';

type TabId = 'overview' | 'members';

export default function CohortEditorPage() {
  const { t } = useLocalTranslation(translations);
  const { t: tGuard } = useLocalTranslation(guardTranslations);
  const [urlTab, setTab] = useUrlTab<TabId>('overview', ['overview', 'members']);
  const { go } = useAppNavigate();
  const duplicateMutation = useDuplicateAsStatic();

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
    previewQuery,
    listPath,
    isSaving,
    isValid,
    saveError,
    handleSave,
    unsavedGuard,
  } = useCohortEditor();

  const handleDuplicateAsStatic = async () => {
    if (!cohortId) {return;}
    try {
      const newCohort = await duplicateMutation.mutateAsync(cohortId);
      toast.success(t('duplicated'));
      void go.cohorts.detail(newCohort.id);
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

      <div className="flex flex-col lg:flex-row flex-1 lg:min-h-0">
        <MobileQueryPanelToggle>
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
        </MobileQueryPanelToggle>

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
                  <CohortPreviewCount
                    previewQuery={previewQuery}
                    canPreview={canPreview}
                    hasValidConditions={hasValidConditions}
                    fallbackCount={memberCount?.count ?? null}
                  />
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
            <CohortPreviewCount
              previewQuery={previewQuery}
              canPreview={canPreview}
              hasValidConditions={hasValidConditions}
            />
          </main>
        )}
      </div>

      <ConfirmDialog
        open={unsavedGuard.showDialog}
        onOpenChange={(open) => { if (!open) {unsavedGuard.cancelNavigation();} }}
        title={tGuard('title')}
        description={tGuard('description')}
        confirmLabel={tGuard('confirm')}
        cancelLabel={tGuard('cancel')}
        variant="default"
        onConfirm={unsavedGuard.confirmNavigation}
      />
    </div>
  );
}
