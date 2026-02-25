import { useMemo } from 'react';
import { UsersRound, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EditorHeader } from '@/components/ui/editor-header';
import { QueryPanelShell } from '@/components/ui/query-panel-shell';
import { TabNav } from '@/components/ui/tab-nav';
import { CohortGroupBuilder } from '@/features/cohorts/components/CohortGroupBuilder';
import { CohortSizeChart } from '@/features/cohorts/components/CohortSizeChart';
import { MembersTab } from '@/features/cohorts/components/MembersTab';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useUrlTab } from '@/hooks/use-url-tab';
import translations from './cohort-editor.translations';
import { useCohortEditor } from './use-cohort-editor';

type TabId = 'overview' | 'members';

export default function CohortEditorPage() {
  const { t } = useLocalTranslation(translations);
  const [urlTab, setTab] = useUrlTab<TabId>('overview', ['overview', 'members']);

  const {
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
  } = useCohortEditor();

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

  let previewContent: React.ReactNode;
  if (!hasValidConditions) {
    previewContent = (
      <div>
        <p className="text-sm font-medium">{t('addConditionsTitle')}</p>
        <p className="text-sm text-muted-foreground mt-1">{t('addConditionsDescription')}</p>
      </div>
    );
  } else if (previewMutation.isPending) {
    previewContent = (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">{t('calculating')}</span>
      </div>
    );
  } else if (previewMutation.data) {
    previewContent = (
      <div>
        <p className="text-4xl font-bold tabular-nums text-primary">
          {previewMutation.data.count.toLocaleString()}
        </p>
        <p className="text-sm text-muted-foreground mt-1">{t('personsMatch')}</p>
      </div>
    );
  } else {
    previewContent = (
      <div>
        <p className="text-sm font-medium">{t('previewPlaceholder')}</p>
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
        <QueryPanelShell>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t('descriptionLabel')}</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              className="h-8 text-sm"
            />
          </div>

          <div className="border-t border-border" />

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t('conditionsLabel')}</label>
            <CohortGroupBuilder
              groups={groups}
              onChange={setGroups}
              excludeCohortId={cohortId}
            />
          </div>
        </QueryPanelShell>

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
                  <p className="text-4xl font-bold tabular-nums text-primary">
                    {memberCount ? memberCount.count.toLocaleString() : '\u2014'}
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
            <div className="text-center space-y-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto">
                <UsersRound className="h-8 w-8 text-muted-foreground" />
              </div>
              {previewContent}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
